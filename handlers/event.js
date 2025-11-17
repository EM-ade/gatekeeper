import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function(client) {
    const eventsPath = path.join(__dirname, '../events');
    try {
        const eventFiles = await fs.readdir(eventsPath);
        for (const file of eventFiles.filter(f => f.endsWith('.js'))) {
            const filePath = path.join(eventsPath, file);
            // Use dynamic import for ES modules - fix Windows path issue
            const importPath = `file:///${filePath.replace(/\\/g, '/')}`;
            const { default: event } = await import(importPath);
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }
        }
    } catch (error) {
        console.error('Error loading events:', error);
    }
}
