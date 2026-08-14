import { describe, expect, test } from "bun:test"

import { fromDocument, toDocument } from "../src/components/space/document"

const saved = {
  nodes: [
    { id: "n1", type: "service", position: { x: 10, y: 20 }, data: { label: "API" } },
    {
      id: "g1",
      type: "group",
      position: { x: 0, y: 0 },
      width: 340,
      height: 240,
      data: { label: "Backend", color: "sky" },
    },
    {
      id: "n2",
      type: "service",
      position: { x: 5, y: 5 },
      parentId: "g1",
      extent: "parent",
      data: { label: "DB" },
    },
  ],
  edges: [
    {
      id: "e1",
      type: "system",
      source: "n1",
      target: "n2",
      sourceHandle: "right-source",
      targetHandle: "left-target",
      data: { method: "GET" },
    },
  ],
}

describe("loading a saved space", () => {
  const loaded = fromDocument(saved)

  test("restores nodes and edges", () => {
    expect(loaded.nodes).toHaveLength(3)
    expect(loaded.edges).toHaveLength(1)
  })

  test("sorts groups ahead of their children", () => {
    expect(loaded.nodes[0]!.id).toBe("g1")
  })

  test("keeps parenting and explicit sizes", () => {
    expect(loaded.nodes.find((node) => node.id === "n2")?.parentId).toBe("g1")
    expect(loaded.nodes.find((node) => node.id === "g1")?.width).toBe(340)
  })

  test("round-trips without drifting", () => {
    const once = toDocument(loaded.nodes, loaded.edges)
    const reloaded = fromDocument(once)
    expect(toDocument(reloaded.nodes, reloaded.edges)).toEqual(once)
  })
})

describe("saving", () => {
  const loaded = fromDocument(saved)
  const baseline = toDocument(loaded.nodes, loaded.edges)

  test("drops React Flow runtime state", () => {
    const live = loaded.nodes.map((node) => ({
      ...node,
      selected: true,
      dragging: true,
      measured: { width: 112, height: 96 },
    }))
    const written = JSON.stringify(toDocument(live, loaded.edges))
    expect(written).not.toInclude("selected")
    expect(written).not.toInclude("dragging")
    expect(written).not.toInclude("measured")
  })

  test("selection alone does not change the document", () => {
    const selected = loaded.nodes.map((node) => ({ ...node, selected: true }))
    expect(toDocument(selected, loaded.edges)).toEqual(baseline)
  })
})

describe("malformed files", () => {
  const junk = fromDocument({
    nodes: [
      null,
      "nope",
      { id: "ok", type: "service", position: { x: 0, y: 0 } },
      { id: "bad-position", type: "service", position: { x: "1", y: 2 } },
      { id: "no-type", position: { x: 0, y: 0 } },
      { id: "ok", type: "service", position: { x: 9, y: 9 } },
      { id: "orphan", type: "service", position: { x: 0, y: 0 }, parentId: "ghost" },
    ],
    edges: [
      { id: "e-dangling", source: "ok", target: "ghost" },
      { id: "e-ok", source: "ok", target: "orphan" },
      42,
    ],
  })

  test("drops unusable nodes and duplicate ids", () => {
    expect(junk.nodes.map((node) => node.id)).toEqual(["ok", "orphan"])
  })

  test("defaults missing data", () => {
    expect(junk.nodes[0]!.data).toEqual({})
  })

  test("clears a parent link that did not survive", () => {
    expect(junk.nodes.find((node) => node.id === "orphan")?.parentId).toBeUndefined()
  })

  test("drops edges with a missing endpoint", () => {
    expect(junk.edges.map((edge) => edge.id)).toEqual(["e-ok"])
  })

  test("tolerates a missing document", () => {
    expect(fromDocument(undefined)).toEqual({ nodes: [], edges: [] })
  })
})
