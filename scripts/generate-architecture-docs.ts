import fs from "fs"
import path from "path"

const repoRoot = process.cwd()
const ignoredDirs = new Set(["node_modules", ".next", ".git", "dist", "build", "out", "coverage"])
const supportedExts = [".tsx", ".ts", ".jsx", ".js"]

const importRegexes = [
  /import\s+(?:type\s+)?[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
  /import\s*['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
]

const fetchRegexes = [
  /fetch\(\s*`([^`]+)`/g,
  /fetch\(\s*'([^']+)'/g,
  /fetch\(\s*"([^"]+)"/g,
]

function walk(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(fullPath, files)
      }
      continue
    }
    files.push(fullPath)
  }
  return files
}

function readJson(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8")
  return JSON.parse(raw)
}

function normalizePath(filePath: string) {
  return filePath.replace(/\\/g, "/")
}

function toRelative(filePath: string) {
  return normalizePath(path.relative(repoRoot, filePath))
}

function isUiComponent(filePath: string) {
  return normalizePath(filePath).includes("/components/ui/")
}

function isAppRouteFile(filePath: string) {
  const normalized = normalizePath(filePath)
  return normalized.includes("/app/") && !normalized.includes("/app/api/")
}

function resolveImport(spec: string, fromFile: string, appRoot: string) {
  let basePath: string | null = null
  if (spec.startsWith("./") || spec.startsWith("../")) {
    basePath = path.resolve(path.dirname(fromFile), spec)
  } else if (spec.startsWith("@/")) {
    basePath = path.resolve(appRoot, spec.slice(2))
  } else {
    return null
  }

  const ext = path.extname(basePath)
  if (ext && supportedExts.includes(ext) && fs.existsSync(basePath)) {
    return basePath
  }

  for (const suffix of supportedExts) {
    const candidate = `${basePath}${suffix}`
    if (fs.existsSync(candidate)) return candidate
  }

  for (const suffix of supportedExts) {
    const candidate = path.join(basePath, `index${suffix}`)
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

function getImports(filePath: string, cache: Map<string, string>) {
  if (!cache.has(filePath)) {
    cache.set(filePath, fs.readFileSync(filePath, "utf8"))
  }
  const content = cache.get(filePath) ?? ""
  const imports: string[] = []
  for (const regex of importRegexes) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1])
    }
  }
  return imports
}

function extractFetchApiPaths(filePath: string, cache: Map<string, string>) {
  if (!cache.has(filePath)) {
    cache.set(filePath, fs.readFileSync(filePath, "utf8"))
  }
  const content = cache.get(filePath) ?? ""
  const paths: string[] = []
  for (const regex of fetchRegexes) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      const raw = match[1]
      if (raw.startsWith("/api")) {
        paths.push(raw)
      }
    }
  }
  return paths
}

function findNextAppRoot(allFiles: string[]) {
  const packageFiles = allFiles.filter((file) => path.basename(file) === "package.json")
  const candidates: { dir: string; hasNext: boolean }[] = []

  for (const pkgFile of packageFiles) {
    const dir = path.dirname(pkgFile)
    try {
      const pkg = readJson(pkgFile)
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      const hasNext = typeof deps.next === "string"
      candidates.push({ dir, hasNext })
    } catch {
      // ignore invalid json
    }
  }

  const nextCandidates = candidates.filter((c) => c.hasNext)
  if (nextCandidates.length === 0) return null

  for (const candidate of nextCandidates) {
    const appDir = path.join(candidate.dir, "app")
    if (fs.existsSync(appDir) && fs.statSync(appDir).isDirectory()) {
      return candidate.dir
    }
  }

  return nextCandidates[0]?.dir ?? null
}

function findReadmePath(allFiles: string[], appRoot: string) {
  const appReadme = path.join(appRoot, "README.md")
  if (fs.existsSync(appReadme)) return appReadme

  const readmes = allFiles.filter((file) => path.basename(file).toLowerCase() === "readme.md")
  if (readmes.length === 0) return null

  const sorted = readmes.sort((a, b) => {
    const aRel = path.relative(appRoot, a)
    const bRel = path.relative(appRoot, b)
    return aRel.length - bRel.length
  })
  return sorted[0]
}

function buildApiPattern(filePath: string, appDir: string) {
  const rel = path.relative(appDir, filePath)
  const parts = rel.split(path.sep)
  const apiIndex = parts.indexOf("api")
  if (apiIndex === -1) return null
  const withoutFile = parts.slice(apiIndex + 1, parts.length - 1)
  const routePath = `/api/${withoutFile.join("/")}`
  return { routePath, parts: withoutFile, filePath }
}

function segmentIsWildcard(segment: string) {
  return segment.startsWith("[") && segment.endsWith("]")
}

function segmentIsCatchAll(segment: string) {
  return segment.startsWith("[...") && segment.endsWith("]")
}

function matchApiPattern(requestSegments: string[], patternSegments: string[]) {
  let i = 0
  let j = 0
  while (i < requestSegments.length && j < patternSegments.length) {
    const req = requestSegments[i]
    const pat = patternSegments[j]
    if (segmentIsCatchAll(pat)) return true
    if (segmentIsWildcard(pat) || req.includes("${")) {
      i += 1
      j += 1
      continue
    }
    if (req !== pat) return false
    i += 1
    j += 1
  }
  if (i === requestSegments.length && j === patternSegments.length) return true
  if (j < patternSegments.length && segmentIsCatchAll(patternSegments[j])) return true
  return false
}

function scorePattern(patternSegments: string[]) {
  return patternSegments.reduce((score, segment) => {
    if (segmentIsCatchAll(segment)) return score - 2
    if (segmentIsWildcard(segment)) return score - 1
    return score + 2
  }, 0)
}

function selectBestApiMatch(requestPath: string, apiPatterns: ReturnType<typeof buildApiPattern>[]) {
  const pathOnly = requestPath.split("?")[0]
  const reqSegments = pathOnly.replace(/^\/+/, "").split("/").slice(1)
  const matches = apiPatterns
    .filter((pattern) => pattern && matchApiPattern(reqSegments, pattern.parts))
    .map((pattern) => ({ pattern, score: scorePattern(pattern!.parts) }))
    .sort((a, b) => b.score - a.score)

  return matches[0]?.pattern ?? null
}

function buildMermaidNodes(
  files: string[],
  idMap: Map<string, string>,
  labels: Map<string, string>
) {
  const nodes: string[] = []
  for (const file of files) {
    if (!idMap.has(file)) {
      idMap.set(file, `N${idMap.size + 1}`)
    }
    const id = idMap.get(file) as string
    if (!labels.has(id)) {
      labels.set(id, toRelative(file))
    }
    nodes.push(`${id}["${labels.get(id)}"]`)
  }
  return nodes
}

function renderEdges(edges: Array<[string, string]>, idMap: Map<string, string>) {
  return edges.map(([from, to]) => {
    const fromId = idMap.get(from) as string
    const toId = idMap.get(to) as string
    return `${fromId} --> ${toId}`
  })
}

function getAppRouteGroupLabel(filePath: string, appDir: string) {
  const rel = normalizePath(path.relative(appDir, filePath))
  const parts = rel.split("/").filter(Boolean)
  const trimmed = parts.filter((part) => !(part.startsWith("(") && part.endsWith(")")))
  const appIndex = trimmed.indexOf("app")
  const routeParts = appIndex === -1 ? trimmed : trimmed.slice(appIndex + 1)
  if (routeParts.length === 0) return "root"
  return routeParts[0].replace(/\[(.+)\]/, "$1")
}

function getApiRouteGroupLabel(filePath: string, appDir: string) {
  const rel = normalizePath(path.relative(appDir, filePath))
  const parts = rel.split("/").filter(Boolean)
  const apiIndex = parts.indexOf("api")
  if (apiIndex === -1) return "api"
  const routeParts = parts.slice(apiIndex + 1)
  if (routeParts.length === 0) return "api"
  return routeParts[0].replace(/\[(.+)\]/, "$1")
}

function main() {
  const allFiles = walk(repoRoot)
  const appRoot = findNextAppRoot(allFiles)
  if (!appRoot) {
    throw new Error("No Next.js app root found.")
  }

  const appDir = path.join(appRoot, "app")
  const readmePath = findReadmePath(allFiles, appRoot)
  if (!readmePath) {
    throw new Error("No README.md found.")
  }

  const tsFiles = allFiles.filter((file) => [".ts", ".tsx"].includes(path.extname(file)))
  const pageFiles = tsFiles.filter((file) => normalizePath(file).includes("/app/") && file.endsWith("page.tsx"))
  const layoutFiles = tsFiles.filter((file) => normalizePath(file).includes("/app/") && file.endsWith("layout.tsx"))
  const apiFiles = tsFiles.filter((file) => {
    const rel = normalizePath(path.relative(appDir, file))
    if (!rel.startsWith("api/")) return false
    const base = path.basename(file)
    return ["route.ts", "route.tsx", "page.ts", "page.tsx", "handler.ts", "handler.tsx"].includes(base)
  })

  const contentCache = new Map<string, string>()
  const importCache = new Map<string, string[]>()

  function getImportsCached(filePath: string) {
    if (!importCache.has(filePath)) {
      const imports = getImports(filePath, contentCache)
      importCache.set(filePath, imports)
    }
    return importCache.get(filePath) ?? []
  }

  const layoutByDir = new Map<string, string>()
  for (const layoutFile of layoutFiles) {
    layoutByDir.set(path.dirname(layoutFile), layoutFile)
  }

  const hierarchyEdges = new Set<string>()
  const componentEdges = new Set<string>()

  const addEdge = (set: Set<string>, from: string, to: string) => {
    set.add(`${from}::${to}`)
  }

  function findNearestLayout(filePath: string) {
    let current = path.dirname(filePath)
    while (current.startsWith(appDir)) {
      const match = layoutByDir.get(current)
      if (match) return match
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
    return null
  }

  for (const layoutFile of layoutFiles) {
    const parentLayout = findNearestLayout(path.dirname(layoutFile))
    if (parentLayout && parentLayout !== layoutFile) {
      addEdge(hierarchyEdges, parentLayout, layoutFile)
    }
  }

  for (const pageFile of pageFiles) {
    const nearestLayout = findNearestLayout(pageFile)
    if (nearestLayout) {
      addEdge(hierarchyEdges, nearestLayout, pageFile)
    }
  }

  const traversalQueue: string[] = []
  const visited = new Set<string>()

  function enqueueForTraversal(filePath: string) {
    if (!visited.has(filePath)) {
      traversalQueue.push(filePath)
    }
  }

  for (const file of [...layoutFiles, ...pageFiles]) {
    enqueueForTraversal(file)
  }

  while (traversalQueue.length > 0) {
    const current = traversalQueue.pop() as string
    if (visited.has(current)) continue
    visited.add(current)

    const imports = getImportsCached(current)
    for (const spec of imports) {
      const resolved = resolveImport(spec, current, appRoot)
      if (!resolved) continue
      if (!resolved.endsWith(".tsx")) continue
      if (isUiComponent(resolved)) continue
      addEdge(componentEdges, current, resolved)
      enqueueForTraversal(resolved)
    }
  }

  const apiPatterns = apiFiles
    .map((file) => buildApiPattern(file, appDir))
    .filter((pattern): pattern is NonNullable<ReturnType<typeof buildApiPattern>> => Boolean(pattern))

  const apiEdges = new Set<string>()
  const apiNodes = new Set<string>()
  const uiNodes = new Set<string>()

  for (const file of tsFiles) {
    if (normalizePath(file).includes("/app/api/")) continue
    if (!normalizePath(file).startsWith(normalizePath(appRoot))) continue
    const apiPaths = extractFetchApiPaths(file, contentCache)
    for (const apiPath of apiPaths) {
      const match = selectBestApiMatch(apiPath, apiPatterns)
      if (match) {
        if (isAppRouteFile(file) && !isUiComponent(file)) {
          addEdge(apiEdges, file, match.filePath)
          apiNodes.add(match.filePath)
          uiNodes.add(file)
        }
      }
    }
  }

  const prismaPath = path.join(appRoot, "lib", "prisma.ts")
  const prismaEdges = new Set<string>()
  const prismaNodes: string[] = []

  if (fs.existsSync(prismaPath)) {
    for (const apiFile of apiFiles) {
      const imports = getImportsCached(apiFile)
      const resolvesToPrisma = imports.some((spec) => {
        const resolved = resolveImport(spec, apiFile, appRoot)
        return resolved === prismaPath
      })
      if (resolvesToPrisma) {
        addEdge(prismaEdges, apiFile, prismaPath)
        apiNodes.add(apiFile)
        prismaNodes.push(prismaPath)
      }
    }
  }

  const idMap = new Map<string, string>()
  const labels = new Map<string, string>()

  const architectureUiNodes = Array.from(uiNodes)
  const architectureApiNodes = Array.from(apiNodes)
  const architecturePrismaNodes = Array.from(new Set(prismaNodes))

  buildMermaidNodes(architectureUiNodes, idMap, labels)
  buildMermaidNodes(architectureApiNodes, idMap, labels)
  buildMermaidNodes(architecturePrismaNodes, idMap, labels)

  const architectureEdges = [...apiEdges, ...prismaEdges].map((edge) => edge.split("::") as [string, string])

  const architectureDiagramLines: string[] = ["graph TB"]
  if (architectureUiNodes.length > 0) {
    architectureDiagramLines.push(`  subgraph "UI (App Router)"`)
    const groupedUiNodes = new Map<string, string[]>()
    for (const file of architectureUiNodes) {
      const group = getAppRouteGroupLabel(file, appDir)
      if (!groupedUiNodes.has(group)) groupedUiNodes.set(group, [])
      groupedUiNodes.get(group)?.push(file)
    }
    for (const [group, files] of groupedUiNodes) {
      architectureDiagramLines.push(`    subgraph "${group}"`)
      for (const node of buildMermaidNodes(files, idMap, labels)) {
        architectureDiagramLines.push(`      ${node}`)
      }
      architectureDiagramLines.push("    end")
    }
    architectureDiagramLines.push("  end")
  }
  if (architectureApiNodes.length > 0) {
    architectureDiagramLines.push(`  subgraph "API Routes"`)
    const groupedApiNodes = new Map<string, string[]>()
    for (const file of architectureApiNodes) {
      const group = getApiRouteGroupLabel(file, appDir)
      if (!groupedApiNodes.has(group)) groupedApiNodes.set(group, [])
      groupedApiNodes.get(group)?.push(file)
    }
    for (const [group, files] of groupedApiNodes) {
      architectureDiagramLines.push(`    subgraph "${group}"`)
      for (const node of buildMermaidNodes(files, idMap, labels)) {
        architectureDiagramLines.push(`      ${node}`)
      }
      architectureDiagramLines.push("    end")
    }
    architectureDiagramLines.push("  end")
  }
  if (architecturePrismaNodes.length > 0) {
    architectureDiagramLines.push(`  subgraph "Data Access"`)
    for (const node of buildMermaidNodes(architecturePrismaNodes, idMap, labels)) {
      architectureDiagramLines.push(`    ${node}`)
    }
    architectureDiagramLines.push("  end")
  }
  for (const edge of renderEdges(architectureEdges, idMap)) {
    architectureDiagramLines.push(`  ${edge}`)
  }
  if (architecturePrismaNodes.length > 0) {
    const prismaId = idMap.get(architecturePrismaNodes[0])
    if (prismaId) {
      architectureDiagramLines.push(`  style ${prismaId} fill:#38bdf8,color:#0f172a`)
    }
  }

  const componentIdMap = new Map<string, string>()
  const componentLabels = new Map<string, string>()
  const componentEdgePairs = [...componentEdges].map((edge) => edge.split("::") as [string, string])
  const hierarchyNodes = Array.from(
    new Set([...layoutFiles, ...pageFiles, ...componentEdgePairs.flatMap((edge) => edge)])
  )

  buildMermaidNodes(hierarchyNodes, componentIdMap, componentLabels)

  const hierarchyDiagramLines: string[] = ["graph TD"]
  for (const node of buildMermaidNodes(hierarchyNodes, componentIdMap, componentLabels)) {
    hierarchyDiagramLines.push(`  ${node}`)
  }
  const allHierarchyEdges = [...hierarchyEdges, ...componentEdges].map(
    (edge) => edge.split("::") as [string, string]
  )
  for (const edge of renderEdges(allHierarchyEdges, componentIdMap)) {
    hierarchyDiagramLines.push(`  ${edge}`)
  }
  const rootLayoutPath = path.join(appRoot, "app", "layout.tsx")
  const rootPagePath = path.join(appRoot, "app", "page.tsx")
  const rootLayoutId = componentIdMap.get(rootLayoutPath)
  const rootPageId = componentIdMap.get(rootPagePath)
  if (rootLayoutId) {
    hierarchyDiagramLines.push(`  style ${rootLayoutId} fill:#FF6B35,color:#111827`)
  }
  if (rootPageId) {
    hierarchyDiagramLines.push(`  style ${rootPageId} fill:#FF6B35,color:#111827`)
  }

  const architectureDiagram = architectureDiagramLines.join("\n")
  const hierarchyDiagram = hierarchyDiagramLines.join("\n")

  const startMarker = "<!-- AUTO-GENERATED-ARCHITECTURE-START -->"
  const endMarker = "<!-- AUTO-GENERATED-ARCHITECTURE-END -->"

  const generatedSection = [
    startMarker,
    "## Application Architecture",
    "",
    "```mermaid",
    architectureDiagram,
    "```",
    "",
    "## Component Hierarchy",
    "",
    "```mermaid",
    hierarchyDiagram,
    "```",
    endMarker,
  ].join("\n")

  const readmeContent = fs.readFileSync(readmePath, "utf8")
  let updatedContent: string

  if (readmeContent.includes(startMarker) && readmeContent.includes(endMarker)) {
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(`${escape(startMarker)}[\\s\\S]*?${escape(endMarker)}`, "m")
    updatedContent = readmeContent.replace(pattern, generatedSection)
  } else {
    const lines = readmeContent.split("\n")
    let insertIndex = 0
    if (lines[0]?.startsWith("#")) {
      insertIndex = 1
      while (lines[insertIndex] === "") insertIndex += 1
    }
    const before = lines.slice(0, insertIndex)
    const after = lines.slice(insertIndex)
    updatedContent = [...before, "", generatedSection, "", ...after].join("\n")
  }

  fs.writeFileSync(readmePath, updatedContent, "utf8")
}

main()
