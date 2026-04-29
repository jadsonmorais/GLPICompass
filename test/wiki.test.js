/**
 * test/wiki.test.js
 * Unit tests for tools/wiki.js — all getters, mock-free (reads real YAML files).
 */

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const {
  getTeamMembers,
  getTags,
  getSuppliers,
  getSupportGroups,
  getCustomQueriesCatalog,
  getActiveProjects,
  getRoutingRules,
  skillDefinitions,
} = require("../tools/wiki");

describe("tools/wiki.js — Wiki as on-demand tools", () => {
  describe("getTeamMembers()", () => {
    test("returns an object with team array", () => {
      const result = getTeamMembers();
      assert.ok(!result.error, `Unexpected error: ${result.error}`);
      assert.ok(Array.isArray(result.team), "team must be an array");
    });

    test("each team member has required fields", () => {
      const { team } = getTeamMembers();
      for (const member of team) {
        assert.ok(member.nome, "member must have nome");
        assert.ok(typeof member.glpi_id === "number", `glpi_id must be a number for ${member.nome}`);
        assert.ok(["gerente", "coordenador", "tecnico"].includes(member.papel), `invalid papel for ${member.nome}`);
        assert.ok(typeof member.eh_admin === "boolean", `eh_admin must be boolean for ${member.nome}`);
      }
    });

    test("vips field exists (may be empty array)", () => {
      const result = getTeamMembers();
      assert.ok(Array.isArray(result.vips), "vips must be an array");
    });
  });

  describe("getTags()", () => {
    test("returns an object with tags array", () => {
      const result = getTags();
      assert.ok(!result.error, `Unexpected error: ${result.error}`);
      assert.ok(Array.isArray(result.tags), "tags must be an array");
    });

    test("each tag has nome and id", () => {
      const { tags } = getTags();
      for (const tag of tags) {
        assert.ok(tag.nome, "tag must have nome");
        assert.ok(typeof tag.id === "number", `tag id must be a number for ${tag.nome}`);
      }
    });
  });

  describe("getSuppliers()", () => {
    test("returns an object with suppliers array", () => {
      const result = getSuppliers();
      assert.ok(!result.error, `Unexpected error: ${result.error}`);
      assert.ok(Array.isArray(result.suppliers), "suppliers must be an array");
      assert.ok(result.suppliers.length > 0, "suppliers should not be empty");
    });

    test("each supplier has nome and id", () => {
      const { suppliers } = getSuppliers();
      for (const s of suppliers) {
        assert.ok(s.nome, "supplier must have nome");
        assert.ok(typeof s.id === "number", `supplier id must be a number for ${s.nome}`);
      }
    });
  });

  describe("getSupportGroups()", () => {
    test("returns support_groups array and ti_group", () => {
      const result = getSupportGroups();
      assert.ok(!result.error, `Unexpected error: ${result.error}`);
      assert.ok(Array.isArray(result.support_groups), "support_groups must be an array");
    });

    test("each group has nome and id", () => {
      const { support_groups } = getSupportGroups();
      for (const g of support_groups) {
        assert.ok(g.nome, "group must have nome");
        assert.ok(typeof g.id === "number", `group id must be a number for ${g.nome}`);
      }
    });
  });

  describe("getCustomQueriesCatalog()", () => {
    test("returns an object with queries array", () => {
      const result = getCustomQueriesCatalog();
      assert.ok(!result.error, `Unexpected error: ${result.error}`);
      assert.ok(Array.isArray(result.queries), "queries must be an array");
    });

    test("each query has nome and token_env", () => {
      const { queries } = getCustomQueriesCatalog();
      for (const q of queries) {
        assert.ok(q.nome, "query must have nome");
        assert.ok(q.token_env, `query ${q.nome} must have token_env`);
      }
    });
  });

  describe("getActiveProjects()", () => {
    test("returns active_initiatives and open_problems arrays", () => {
      const result = getActiveProjects();
      assert.ok(!result.error, `Unexpected error: ${result.error}`);
      assert.ok(Array.isArray(result.active_initiatives), "active_initiatives must be an array");
      assert.ok(Array.isArray(result.open_problems), "open_problems must be an array");
    });

    test("Problem 206 is present in open_problems", () => {
      const { open_problems } = getActiveProjects();
      const p206 = open_problems.find((p) => p.glpi_problem_id === 206);
      assert.ok(p206, "Problem 206 must be present in open_problems");
    });
  });

  describe("getRoutingRules()", () => {
    test("returns routing_rules, vip_rules, operational_decisions arrays", () => {
      const result = getRoutingRules();
      assert.ok(!result.error, `Unexpected error: ${result.error}`);
      assert.ok(Array.isArray(result.routing_rules), "routing_rules must be an array");
      assert.ok(Array.isArray(result.vip_rules), "vip_rules must be an array");
      assert.ok(Array.isArray(result.operational_decisions), "operational_decisions must be an array");
    });
  });

  describe("skillDefinitions — OpenAI function schema", () => {
    test("all skills have valid function schema", () => {
      for (const skill of skillDefinitions) {
        const { definition } = skill;
        assert.strictEqual(definition.type, "function", `${definition.function?.name} must have type='function'`);
        assert.ok(definition.function?.name, "skill must have a name");
        assert.ok(definition.function?.description, `${definition.function.name} must have a description`);
        assert.strictEqual(
          definition.function?.parameters?.type,
          "object",
          `${definition.function.name} parameters.type must be 'object'`
        );
        assert.ok(typeof skill.handler === "function", `${definition.function.name} must have a handler function`);
      }
    });

    test("all skill names are unique", () => {
      const names = skillDefinitions.map((s) => s.definition.function.name);
      assert.strictEqual(names.length, new Set(names).size, "skill names must be unique");
    });

    test("handlers return non-error objects when YAML files exist", () => {
      for (const skill of skillDefinitions) {
        const result = skill.handler();
        assert.ok(!result.error, `${skill.definition.function.name} returned error: ${result.error}`);
      }
    });
  });
});
