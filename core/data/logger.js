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
        this.sessionFolder = path.resolve(__dirname, 'sessions', `${toolCode}_${timestamp}`);
        await fsp.mkdir(this.sessionFolder, { recursive: true });
        
        const infoPath = path.join(this.sessionFolder, 'info.json');
        const infoData = {
            toolCode: toolCode,
            website: website,
            timestamps: [timestamp]
        };
        await fsp.writeFile(infoPath, JSON.stringify(infoData, null, 2), 'utf8');
        
        console.log(`📄 Session info: ${infoPath}`);
        return this.sessionFolder;
    }

}

