const fs = require('fs'); let js = fs.readFileSync('D:/Rangdhanu Turso/backend/server.js', 'utf8'); js = js.replace('    } catch (error) {',         if (action === 'pdacc') {
            const updatesResult = await db.execute('SELECT * FROM pdacc_updates WHERE is_show = 1 ORDER BY posted_date DESC');
            const noticesResult = await db.execute('SELECT * FROM pdacc_notices WHERE is_show = 1 ORDER BY posted_date DESC');
            return res.json({
                success: true,
                ticker: noticesResult.rows.map(row => ({ lineId: row.line_id, text: row.notice_text })),
                updates: updatesResult.rows.map(row => ({
                    updateId: row.update_id, title: row.title, description: row.description, link: row.link,
                    image: row.image_id ? 'https://drive.google.com/uc?export=view&id=' + row.image_id : row.image_url,
                    postedDate: row.posted_date
                }))
            });
        }
        if (action === 'pdaccstats') {
            const statsResult = await db.execute('SELECT * FROM pdacc_stats');
            const stats = {};
            statsResult.rows.forEach(row => {
                const k = row.stat_key;
                if (['chance', 'success', 'teachers'].includes(k)) {
                    stats[k] = { kicker: row.kicker, title: row.title, figure: row.figure, unit: row.unit, note: row.note };
                } else if (k === 'timeline') {
                    stats[k] = { years: row.years, yearsFrom: row.years_from };
                }
            });
            return res.json({ success: true, stats });
        }
        return res.status(400).json({ success: false, message: 'Invalid action' });
    } catch (error) {); fs.writeFileSync('D:/Rangdhanu Turso/backend/server.js', js);
