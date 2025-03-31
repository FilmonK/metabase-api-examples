import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: "../.env" });

const main = async () => {
    try {
        let response = await fetch(`${process.env.LOCAL_BASE_URL}/api/util/logs`, {
            headers: {
                "Content-Type": "application/json",
                "X-API-KEY": process.env.API_KEY,
            }
        });

        let utilityLogs = await response.json();

        // Check APIs response structure before parsing
        let logsArray = Array.isArray(utilityLogs.body) 
            ? utilityLogs.body 
            : Array.isArray(utilityLogs.logs) 
            ? utilityLogs.logs 
            : Array.isArray(utilityLogs.data) 
            ? utilityLogs.data 
            : Array.isArray(utilityLogs) 
            ? utilityLogs 
            : [];

        if (!logsArray.length) {
            console.log("No logs found or invalid response structure.");
            return;
        }


        const filteredLogs = logsArray.filter(log => 
            Object.values(log).some(value => 
                typeof value === "string" && value.toLowerCase().includes("sync")
            )
        );

        if (filteredLogs.length === 0) {
            console.log("No logs matched the search criteria.");
            return;
        }

        console.log("Filtered Logs:", filteredLogs);

        // Convert logs to CSV
        const csvHeader = "timestamp,level,fqns,msg,exception,process_uuid\n";
        const csvRows = filteredLogs.map(log => {
            return `${log.timestamp || ""},${log.level || ""},${log.fqns || ""},"${(log.msg || "").replace(/"/g, '""')}",${log.exception || ""},${log.process_uuid || ""}`;
        }).join("\n");


        const filePath = "filtered_logs.csv";
        fs.writeFileSync(filePath, csvHeader + csvRows, "utf8");

        console.log(`CSV file successfully saved at: ${filePath}`);

    } catch (error) {
        console.error(`Error fetching logs: ${error.message}`);
    }
};

main();
