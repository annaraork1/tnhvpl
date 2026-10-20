import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMasterCatalog, filterCatalogPlayers, filterCatalogTeams } from "../lib/catalog.ts";

test("master catalog merges seasons and newest wins fields", () => {
  const cat = buildMasterCatalog([
    {
      key: "s1",
      name: "Season 1",
      createdAt: 1,
      teams: [{ id: "t1", name: "Eagles", short: "EAG", owner: "Old", color: "#111111", logo: "/a.png", squad: [1] }],
      players: [{ no: 1, name: "Alex", skill: "Beginner", photo: null }],
    },
    {
      key: "s2",
      name: "Season 2",
      createdAt: 2,
      teams: [{ id: "eagles", name: "Eagles", short: "EGL", owner: "New", color: "#222222", logo: "/b.png", squad: [2] }],
      players: [{ no: 2, name: "Alex", skill: "Advanced", photo: "data:x" }],
    },
  ]);
  assert.equal(cat.teams.length, 1);
  assert.equal(cat.teams[0].owner, "New");
  assert.equal(cat.teams[0].id, "eagles");
  assert.deepEqual(cat.teams[0].seasons, ["s2", "s1"]);
  assert.equal(cat.players[0].skill, "Advanced");
  assert.equal(cat.players[0].photo, "data:x");
});

test("catalog search filters and excludes names already in season", () => {
  const cat = buildMasterCatalog([
    {
      key: "s1",
      name: "S1",
      createdAt: 1,
      teams: [
        { id: "a", name: "Alpha", short: "ALP", owner: "Ann", color: "#111111", logo: "/a.png", squad: [] },
        { id: "b", name: "Beta", short: "BET", owner: "Bob", color: "#222222", logo: "/b.png", squad: [] },
      ],
      players: [
        { no: 1, name: "Pat", skill: "Advanced", photo: null },
        { no: 2, name: "Sam", skill: "Beginner", photo: null },
      ],
    },
  ]);
  const teams = filterCatalogTeams(cat.teams, "alp", new Set(["beta"]));
  assert.equal(teams.length, 1);
  assert.equal(teams[0].name, "Alpha");
  const players = filterCatalogPlayers(cat.players, "sa", new Set(["pat"]));
  assert.equal(players.length, 1);
  assert.equal(players[0].name, "Sam");
});
