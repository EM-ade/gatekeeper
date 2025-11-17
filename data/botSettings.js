
import sql from '../db.js';

export const setSetting = async (settingName, settingValue) => {
    try {
        const result = await sql`
            INSERT INTO bot_settings (setting_name, setting_value)
            VALUES (${settingName}, ${settingValue})
            ON CONFLICT (setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value
            RETURNING setting_value;
        `;
        console.log(`Setting '${settingName}' saved to Supabase: '${settingValue}'`);
        return result[0].setting_value;
    } catch (error) {
        console.error(`Error saving setting '${settingName}' to Supabase:`, error);
        return null;
    }
};

export const getSetting = async (settingName) => {
    try {
        const result = await sql`
            SELECT setting_value FROM bot_settings WHERE setting_name = ${settingName};
        `;
        if (result.length > 0) {
            console.log(`Setting '${settingName}' retrieved from Supabase: '${result[0].setting_value}'`);
            return result[0].setting_value;
        } else {
            console.log(`Setting '${settingName}' not found in Supabase.`);
            return null;
        }
    } catch (error) {
        console.error(`Error retrieving setting '${settingName}' from Supabase:`, error);
        return null;
    }
};
