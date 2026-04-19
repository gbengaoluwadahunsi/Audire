import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_KEY missing in .env');
    process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
    console.log('Checking Supabase tables...');

    // Try to list tables (generic check for public schema)
    const { data: tables, error: tableError } = await supabase.rpc('get_tables'); // RPC might not exist, but we can try other tables

    // Try common table names
    const potentialTables = ['books', 'user_books', 'Library'];
    for (const table of potentialTables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (!error) {
            console.log(`- TABLE FOUND: ${table}`);
            const { data: all } = await supabase.from(table).select('*');
            console.log(`  Count: ${all.length}`);
        } else {
            console.log(`- TABLE MISSING: ${table} (${error.message})`);
        }
    }

    console.log('\nChecking Supabase Storage buckets...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        console.error('Error listing buckets:', bucketError.message);
    } else {
        for (const b of buckets) {
            console.log(`- BUCKET: ${b.name}`);
            const { data: files, error: listError } = await supabase.storage.from(b.name).list('', {
                limit: 100,
                offset: 0,
                sortBy: { column: 'name', order: 'asc' },
            });
            if (listError) {
                console.error(`  Error listing files: ${listError.message}`);
            } else {
                files.forEach(f => {
                    if (f.name !== '.emptyFolderPlaceholder') {
                        console.log(`  * ${f.name} (${f.metadata?.size || 0} bytes)`);
                    }
                });
            }
        }
    }
}

check();
