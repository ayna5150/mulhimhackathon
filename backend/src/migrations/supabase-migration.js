/**
 * Supabase Migration Runner
 * 
 * This script runs database migrations on Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSupabaseMigration() {
  // Validate required environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL:', supabaseUrl ? '✓' : '✗ Missing');
    console.error('   SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY:', supabaseKey ? '✓' : '✗ Missing');
    process.exit(1);
  }

  try {
    console.log('🔌 Connecting to Supabase...');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test connection
    const { data, error: testError } = await supabase.from('analytics').select('count').limit(0);
    
    if (testError && !testError.message.includes('does not exist')) {
      console.error('❌ Connection test failed:', testError.message);
      console.log('ℹ️  Note: If tables don\'t exist yet, this is normal. Proceeding with migration...');
    } else {
      console.log('✓ Connected to Supabase successfully');
    }

    // Read and execute SQL file
    console.log('📄 Reading migration SQL file...');
    const sqlPath = path.join(__dirname, '..', 'sql', 'supabase-init.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Split by semicolons and execute each statement
    console.log('🚀 Executing migration...');
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments and empty statements
      if (statement.startsWith('--') || statement.length < 5) {
        continue;
      }

      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        // If rpc doesn't exist, try direct query (admin API)
        if (error) {
          console.log(`   Executing statement ${i + 1}/${statements.length}...`);
          // For now, we'll use the SQL Editor approach instead
          console.log('   ⚠️  Note: Using SQL Editor for migration');
          break;
        }
        
        successCount++;
      } catch (err) {
        errorCount++;
        console.warn(`   Warning executing statement ${i + 1}:`, err.message);
      }
    }

    if (successCount > 0) {
      console.log(`✓ Migration completed: ${successCount} statements executed`);
    }

    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} statements had errors`);
    }

    console.log('\n📋 IMPORTANT: Please run the SQL migration manually in Supabase SQL Editor:');
    console.log('   1. Go to your Supabase project dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the contents of: backend/sql/supabase-init.sql');
    console.log('   4. Click "Run" to execute');
    console.log('\n   File location:', path.resolve(sqlPath));

    console.log('\n✅ Supabase migration preparation complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run the SQL in Supabase SQL Editor (see path above)');
    console.log('   2. Test the connection: npm run test:supabase');
    console.log('   3. Start your application: npm run dev');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runSupabaseMigration();
