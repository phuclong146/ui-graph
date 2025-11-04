import { drawPanelBoundingBoxes } from '../media/screenshot.js';
import { saveBase64AsFile } from '../utils/utils.js';
import { uploadPictureAndGetUrl } from '../media/uploader.js';
import { ENV } from '../config/env.js';
import { MySQLExporter } from '../data/mysql-exporter.js';

export async function saveResults(tracker) {
    console.log("processing saveResults");
    
    if (!tracker.dataItemManager || !tracker.parentPanelManager) {
        console.error('Managers not initialized');
        return;
    }
    
    const items = await tracker.dataItemManager.getAllItems();
    
    const uploadTimestamp = Date.now();
    let uploadedCount = 0;
    
    for (const item of items) {
        if (item.item_category === 'PANEL' && item.image_base64 && !item.image_url) {
            try {
                const parentEntry = await tracker.parentPanelManager.getPanelEntry(item.item_id);
                const actionIds = parentEntry?.child_actions || [];
                
                const actions = [];
                for (const actionId of actionIds) {
                    const actionItem = await tracker.dataItemManager.getItem(actionId);
                    if (actionItem) {
                        actions.push({
                            action_name: actionItem.name,
                            action_type: actionItem.type,
                            action_verb: actionItem.verb,
                            action_content: actionItem.content,
                            action_pos: {
                                x: actionItem.metadata?.x || 0,
                                y: actionItem.metadata?.y || 0,
                                w: actionItem.metadata?.w || 0,
                                h: actionItem.metadata?.h || 0
                            }
                        });
                    }
                }
                
                const geminiResult = actions.length > 0 ? [{ panel_title: item.name, actions: actions }] : null;
                const screenshotWithBoxes = geminiResult 
                    ? await drawPanelBoundingBoxes(item.image_base64, geminiResult, '#00aaff', 2)
                    : item.image_base64;
                
                if (screenshotWithBoxes) {
                    uploadedCount++;
                    const picCode = `screen_${uploadTimestamp}_${uploadedCount}`;
                const fname = `${picCode}.jpg`;
                const filePath = saveBase64AsFile(screenshotWithBoxes, "./screenshots", fname);
                
                    if (filePath) {
                const resp = await uploadPictureAndGetUrl(filePath, picCode, ENV.API_TOKEN);
                const jsonData = JSON.parse(resp);
                if (jsonData?.status === 200) {
                            const imageUrl = jsonData.message;
                            console.log(`✅ Uploaded screenshot for panel ${item.name}`);
                            
                            await tracker.dataItemManager.updateItem(item.item_id, { image_url: imageUrl });
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ Failed to upload screenshot for panel ${item.name}:`, err);
            }
        }
    }
    
    const panels = items.filter(i => i.item_category === 'PANEL');
    const actions = items.filter(i => i.item_category === 'ACTION');
    
    console.log(`=== Tracking Results ===`);
    console.log(`Total panels: ${panels.length}`);
    console.log(`Total actions: ${actions.length}`);
    
    try {
        const exporter = new MySQLExporter(tracker.sessionFolder, tracker.urlTracking, tracker.myAiToolCode);
        await exporter.init();
        
        await exporter.exportToMySQL();
        await exporter.close();
        
        console.log('✅ Exported to MySQL doing_item');
        } catch (err) {
        console.error('❌ Failed to export to MySQL:', err);
    }
}

