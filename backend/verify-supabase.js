/**
 * Verify Supabase Storage setup. Run: node verify-supabase.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_KEY?.trim();

async function verify() {
  console.log('Verifying Supabase Storage setup...\n');

  if (!url || !key) {
    console.error('FAIL: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    process.exit(1);
  }
  console.log('OK: Environment variables set');

  const supabase = createClient(url, key);

  // List buckets
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.error('FAIL: Cannot list buckets:', bucketsError.message);
    process.exit(1);
  }
  console.log('OK: Connected to Supabase Storage');

  const bucketNames = buckets?.map((b) => b.name) || [];
  const hasBooks = bucketNames.includes('Books');
  const hasCovers = bucketNames.includes('Covers');

  if (hasBooks) {
    console.log('OK: Bucket "Books" exists');
  } else {
    console.log('MISSING: Bucket "Books" not found. Create it in Supabase Dashboard → Storage');
  }

  if (hasCovers) {
    console.log('OK: Bucket "Covers" exists');
  } else {
    console.log('MISSING: Bucket "Covers" not found. Create it in Supabase Dashboard → Storage');
  }

  if (hasBooks && hasCovers) {
    console.log('\nAll checks passed. Supabase Storage is ready.');
  } else {
    console.log('\nCreate the missing buckets above, then redeploy.');
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
