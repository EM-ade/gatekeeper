import fs from 'fs/promises';
import path from 'path';
import { Collection } from 'discord.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../commands');
    try {
        const commandFiles = await fs.readdir(commandsPath);
        for (const file of commandFiles.filter(f => f.endsWith('.js'))) {
            const filePath = path.join(commandsPath, file);
            try {
                // Use dynamic import for ES modules - fix Windows path issue
                const importPath = `file:///${filePath.replace(/\\/g, '/')}`;
                const commandModule = await import(importPath);
                const command = commandModule.default;
                
                if (!command) {
                    console.log(`[WARNING] The command at ${file} has no default export.`);
                    continue;
                }
                
                if (command?.disabled) {
                    console.log(`[INFO] Skipping disabled command at ${file}`);
                    continue;
                }
                
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                    console.log(`[INFO] Loaded command: ${command.data.name}`);
                } else {
                    console.log(`[WARNING] The command at ${file} is missing a required "data" or "execute" property.`);
                }
            } catch (fileError) {
                console.error(`[ERROR] Failed to load command ${file}:`, fileError.message);
            }
        }
        console.log(`[INFO] Successfully loaded ${client.commands.size} commands`);
    } catch (error) {
        console.error('Error loading commands:', error);
    }
}
