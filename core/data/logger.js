import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(path.dirname(__filename)));

export class TrackingLogger {
    constructor() {
        this.sessionFolder = null;
    }

    async initLogFile(timestamp, toolCode, website) {
        // Read account.role from account.json first (before creating folder)
        let accountRole = 'DRAW'; // Default to DRAW if account.json doesn't exist or doesn't have role
        try {
            const accountPath = path.join(__dirname, 'account.json');
            const accountContent = await fsp.readFile(accountPath, 'utf8');
            const accountData = JSON.parse(accountContent);
            if (accountData && accountData.role) {
                accountRole = accountData.role;
            }
        } catch (err) {
            console.log('⚠️ Could not read account.json, using default role: DRAW');
        }

        // Session folder: VALIDATE_ prefix when role is VALIDATE, to distinguish from DRAW sessions
        const folderName = accountRole === 'VALIDATE'
            ? `VALIDATE_${toolCode}_${timestamp}`
            : `${toolCode}_${timestamp}`;
        this.sessionFolder = path.resolve(__dirname, 'sessions', folderName);
        await fsp.mkdir(this.sessionFolder, { recursive: true });
        
        const infoPath = path.join(this.sessionFolder, 'info.json');
        const infoData = {
            toolCode: toolCode,
            website: website,
            timestamps: [timestamp],
            role: accountRole
        };
        await fsp.writeFile(infoPath, JSON.stringify(infoData, null, 2), 'utf8');
        
        console.log(`📄 Session info: ${infoPath} (role: ${accountRole})`);
        return this.sessionFolder;
    }

}

