import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";
dotenv.config({ path: "../.env" });

const main = async () => {
  try {
    const headers = {
      "Content-Type": "application/json",
      "X-API-KEY": process.env.API_KEY,
    };

    // Fetch all users
    // https://www.metabase.com/docs/latest/api#tag/apiuser
    const userRes = await fetch(`${process.env.LOCAL_BASE_URL}/api/user`, { headers });
    if (!userRes.ok) throw new Error(`Failed to fetch users: ${userRes.status}`);
    const { data: users } = await userRes.json();

    // Fetch permissions graph
    // https://www.metabase.com/docs/latest/api#tag/apipermissions/GET/api/permissions/graph
    const permRes = await fetch(`${process.env.LOCAL_BASE_URL}/api/permissions/graph`, { headers });
    if (!permRes.ok) throw new Error(`Failed to fetch permissions: ${permRes.status}`);
    const permissions = await permRes.json();
    const groupGraphs = permissions.groups;

    // Fetch all groups
    // https://www.metabase.com/docs/latest/api#tag/apipermissions/GET/api/permissions/group
    const groupsRes = await fetch(`${process.env.LOCAL_BASE_URL}/api/permissions/group`, { headers });
    const groupList = await groupsRes.json();
    const groupNames = {};
    groupList.forEach((g) => (groupNames[g.id] = g.name));

    // Collect all known DB IDs from all groups
    const allDbIds = new Set();
    Object.values(groupGraphs).forEach((dbAccessByDbId) => {
      Object.keys(dbAccessByDbId).forEach((dbId) => allDbIds.add(dbId));
    });

    const conflicts = [];

    for (const user of users) {
      const email = user.email;
      const groupIds = user.group_ids || user.groups || [];

      const dbPermMap = {};

      for (const groupId of groupIds) {
        const dbAccessByDbId = groupGraphs[groupId] || {};

        for (const dbId of allDbIds) {
          const perms = dbAccessByDbId[dbId];

          if (!perms) {
            const key = `${dbId}::view-data`;
            if (!dbPermMap[key]) dbPermMap[key] = { values: new Set(), sources: {} };
            dbPermMap[key].values.add("none");
            dbPermMap[key].sources["none"] = (dbPermMap[key].sources["none"] || []).concat(groupNames[groupId]);
            continue;
          }

          for (const [permType, value] of Object.entries(perms)) {
            const key = `${dbId}::${permType}`;
            if (!dbPermMap[key]) dbPermMap[key] = { values: new Set(), sources: {} };
            const normalized = typeof value === "object" ? JSON.stringify(value) : value;
            dbPermMap[key].values.add(normalized);
            dbPermMap[key].sources[normalized] = (dbPermMap[key].sources[normalized] || []).concat(groupNames[groupId]);
          }
        }
      }

      // Conflict logging
      Object.entries(dbPermMap).forEach(([key, obj]) => {
        if (obj.values.size > 1) {
          const [dbId, permType] = key.split("::");
          conflicts.push({
            user: email,
            db_id: dbId,
            perm_type: permType,
            values: [...obj.values].join(", "),
            sources: Object.entries(obj.sources)
              .map(([val, groups]) => `${val}: [${groups.join(", ")}])`)
              .join(" | "),
          });
        }
      });
    }

    
    conflicts.forEach((c) => {
      console.log(`\n Conflict for ${c.user} on DB ${c.db_id}, ${c.perm_type}`);
      console.log(`  Values: ${c.values}`);
      console.log(`  Sources: ${c.sources}`);
    });

    // Export to CSV
    const csv = ["user,db_id,perm_type,values,sources"];
    for (const row of conflicts) {
      csv.push(`"${row.user}",${row.db_id},${row.perm_type},"${row.values}","${row.sources}"`);
    }
    fs.writeFileSync("conflict_report.csv", csv.join("\n"));
    console.log("\n✅ CSV exported to conflict_report.csv");
  } catch (error) {
    console.error("\u274C Error:", error);
  }
};

main();
