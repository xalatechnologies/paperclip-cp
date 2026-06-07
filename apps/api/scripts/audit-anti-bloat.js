const postgres = require("/usr/local/lib/node_modules/paperclipai/node_modules/postgres");
const sql = postgres({host:"127.0.0.1", port:54329, database:"paperclip", username:"paperclip", password:"paperclip", max:1});

async function main() {
  let failures = 0;
  let warnings = 0;
  let passes = 0;
  
  function pass(msg) { console.log("  ✅ PASS:", msg); passes++; }
  function fail(msg) { console.log("  ❌ FAIL:", msg); failures++; }
  function warn(msg) { console.log("  ⚠️  WARN:", msg); warnings++; }
  
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║    PCC ANTI-BLOAT COMPREHENSIVE AUDIT               ║");
  console.log("║    " + new Date().toISOString() + "              ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  
  // =========================================================================
  // TEST 1: Mandatory skills on every company
  // =========================================================================
  console.log("═══ TEST 1: MANDATORY SKILLS ═══");
  const companies = await sql`SELECT id, name FROM companies ORDER BY name`;
  const mandatorySkills = ['context-budget-guard', 'thin-context-policy', 'no-progress-guard'];
  
  for (const c of companies) {
    const skills = await sql`SELECT slug FROM company_skills WHERE company_id = ${c.id} AND slug = ANY(${mandatorySkills})`;
    const found = skills.map(s => s.slug);
    for (const ms of mandatorySkills) {
      if (found.includes(ms)) { pass(c.name + " → " + ms); }
      else { fail(c.name + " MISSING " + ms); }
    }
  }
  
  // =========================================================================
  // TEST 2: Every agent has maxTurnsPerRun
  // =========================================================================
  console.log("\n═══ TEST 2: TURN LIMITS ═══");
  const agents = await sql`
    SELECT a.id, a.name, a.adapter_config, a.runtime_config, a.adapter_type, 
           a.status, c.name as company_name,
           a.adapter_config->>'model' as model,
           a.adapter_config->>'maxTurnsPerRun' as max_turns,
           a.adapter_config->>'graceSec' as grace_sec
    FROM agents a JOIN companies c ON c.id = a.company_id
    ORDER BY c.name, a.name
  `;
  
  for (const a of agents) {
    const turns = parseInt(a.max_turns || "0");
    if (turns > 0 && turns <= 25) { pass(a.company_name + "/" + a.name + " → " + turns + " turns"); }
    else if (turns > 25) { warn(a.company_name + "/" + a.name + " → " + turns + " turns (high)"); }
    else { fail(a.company_name + "/" + a.name + " → NO turn limit"); }
  }
  
  // =========================================================================
  // TEST 3: Every agent has graceSec
  // =========================================================================
  console.log("\n═══ TEST 3: GRACE TIMEOUT ═══");
  for (const a of agents) {
    const grace = parseInt(a.grace_sec || "0");
    if (grace > 0) { pass(a.company_name + "/" + a.name + " → " + grace + "s"); }
    else { fail(a.company_name + "/" + a.name + " → NO grace timeout"); }
  }
  
  // =========================================================================
  // TEST 4: All heartbeats disabled
  // =========================================================================
  console.log("\n═══ TEST 4: HEARTBEATS DISABLED ═══");
  for (const a of agents) {
    const rc = a.runtime_config || {};
    const hb = rc.heartbeat || {};
    if (hb.enabled === false) { pass(a.company_name + "/" + a.name + " → disabled"); }
    else if (hb.enabled === true) { fail(a.company_name + "/" + a.name + " → HEARTBEAT ENABLED"); }
    else { warn(a.company_name + "/" + a.name + " → heartbeat not explicitly set"); }
  }
  
  // =========================================================================
  // TEST 5: Max concurrent runs capped
  // =========================================================================
  console.log("\n═══ TEST 5: MAX CONCURRENT RUNS ═══");
  for (const a of agents) {
    const rc = a.runtime_config || {};
    const hb = rc.heartbeat || {};
    const max = hb.maxConcurrentRuns || 0;
    if (max > 0 && max <= 5) { pass(a.company_name + "/" + a.name + " → " + max); }
    else if (max > 5) { fail(a.company_name + "/" + a.name + " → " + max + " concurrent (TOO HIGH, was 20)"); }
    else { fail(a.company_name + "/" + a.name + " → NO concurrent limit"); }
  }
  
  // =========================================================================
  // TEST 6: Budget policies exist for every agent
  // =========================================================================
  console.log("\n═══ TEST 6: PER-AGENT BUDGET POLICIES ═══");
  for (const a of agents) {
    const bp = await sql`
      SELECT amount, hard_stop_enabled FROM budget_policies 
      WHERE scope_type = 'agent' AND scope_id = ${a.id} AND is_active = true
      LIMIT 1
    `;
    if (bp.length > 0 && bp[0].hard_stop_enabled) {
      pass(a.company_name + "/" + a.name + " → " + bp[0].amount + " tokens hard stop");
    } else if (bp.length > 0) {
      warn(a.company_name + "/" + a.name + " → budget exists but no hard stop");
    } else {
      fail(a.company_name + "/" + a.name + " → NO budget policy");
    }
  }
  
  // =========================================================================
  // TEST 7: Company daily budgets
  // =========================================================================
  console.log("\n═══ TEST 7: COMPANY DAILY BUDGETS ═══");
  for (const c of companies) {
    const bp = await sql`
      SELECT amount, hard_stop_enabled FROM budget_policies 
      WHERE scope_type = 'company' AND scope_id = ${c.id} AND window_kind = 'daily' AND is_active = true
    `;
    if (bp.length > 0 && bp[0].hard_stop_enabled) {
      pass(c.name + " → " + bp[0].amount + " tokens/day hard stop");
    } else {
      fail(c.name + " → NO daily budget");
    }
  }
  
  // =========================================================================
  // TEST 8: No agents on expensive models without justification
  // =========================================================================
  console.log("\n═══ TEST 8: MODEL COST CHECK ═══");
  const expensiveModels = ['claude-opus-4-8', 'claude-opus-4-5', 'gpt-5.5'];
  for (const a of agents) {
    const model = a.model || "(none)";
    const isExpensive = expensiveModels.some(m => model.includes(m));
    const isLead = a.name.toLowerCase().includes("ceo") || a.name.toLowerCase().includes("cto");
    if (isExpensive && !isLead) {
      warn(a.company_name + "/" + a.name + " → " + model + " (expensive, consider Sonnet)");
    } else if (isExpensive && isLead) {
      pass(a.company_name + "/" + a.name + " → " + model + " (lead, acceptable)");
    } else {
      pass(a.company_name + "/" + a.name + " → " + model);
    }
  }
  
  // =========================================================================
  // TEST 9: No agents in error state
  // =========================================================================
  console.log("\n═══ TEST 9: AGENT STATUS ═══");
  for (const a of agents) {
    if (a.status === "error") { fail(a.company_name + "/" + a.name + " → ERROR state"); }
    else if (a.status === "idle" || a.status === "active") { pass(a.company_name + "/" + a.name + " → " + a.status); }
    else { warn(a.company_name + "/" + a.name + " → " + a.status); }
  }
  
  // =========================================================================
  // TEST 10: Historical bloat check — any single run > 500K?
  // =========================================================================
  console.log("\n═══ TEST 10: HISTORICAL BLOAT (runs > 500K tokens) ═══");
  const bloated = await sql`
    SELECT a.name, ce.input_tokens, ce.output_tokens, ce.model, ce.occurred_at, c.name as company_name
    FROM cost_events ce 
    JOIN agents a ON a.id = ce.agent_id
    JOIN companies c ON c.id = ce.company_id
    WHERE ce.input_tokens + ce.output_tokens > 500000
    ORDER BY ce.input_tokens DESC
  `;
  if (bloated.length === 0) {
    pass("No historical runs > 500K tokens");
  } else {
    for (const b of bloated) {
      const total = Number(b.input_tokens) + Number(b.output_tokens);
      warn(b.company_name + "/" + b.name + " → " + total + " tokens (" + b.model + ") on " + b.occurred_at.toISOString().split("T")[0] + " [WOULD NOW BE BLOCKED]");
    }
  }
  
  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║    AUDIT RESULTS                                     ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║  ✅ PASS:    " + String(passes).padEnd(4) + "                                     ║");
  console.log("║  ⚠️  WARN:    " + String(warnings).padEnd(4) + "                                     ║");
  console.log("║  ❌ FAIL:    " + String(failures).padEnd(4) + "                                     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  
  if (failures > 0) {
    console.log("\n⛔ AUDIT FAILED — " + failures + " critical issues must be fixed");
    process.exitCode = 1;
  } else if (warnings > 0) {
    console.log("\n⚠️ AUDIT PASSED WITH WARNINGS — review " + warnings + " items");
  } else {
    console.log("\n🎯 AUDIT PASSED — all controls verified");
  }
  
  await sql.end();
}
main().catch(e => { console.error(e.message); sql.end().catch(()=>{}); process.exit(1); });
