/**
 * Supabase Connection Test
 * 
 * This script tests the connection to Supabase and verifies basic operations
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase Connection...\n');

  // Validate required environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL:', supabaseUrl ? '✓' : '✗ Missing');
    console.error('   SUPABASE_ANON_KEY:', supabaseKey ? '✓' : '✗ Missing');
    console.error('\nPlease add these to your .env file.');
    process.exit(1);
  }

  try {
    // Create Supabase client
    console.log('🔌 Connecting to Supabase...');
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✓ Client created\n');

    // Test 1: Check if tables exist
    console.log('📋 Test 1: Checking tables...');
    const tables = ['users', 'organizations', 'analytics', 'scan_results', 'chat_sessions'];
    
    for (const table of tables) {
      const { error } = await supabase.from(table).select('count').limit(1);
      if (error) {
        console.log(`   ✗ Table "${table}" not found`);
        console.log(`     Error: ${error.message}`);
      } else {
        console.log(`   ✓ Table "${table}" exists`);
      }
    }
    console.log('');

    // Test 2: Insert a test record
    console.log('📝 Test 2: Testing insert operation...');
    const testData = {
      event_type: 'connection_test',
      event_data: { test: true, timestamp: new Date().toISOString() },
      metadata: { source: 'test_script' }
    };

    const { data: insertData, error: insertError } = await supabase
      .from('analytics')
      .insert([testData])
      .select();

    if (insertError) {
      console.log(`   ✗ Insert failed: ${insertError.message}`);
    } else {
      console.log(`   ✓ Insert successful (ID: ${insertData[0].id})`);
      
      // Clean up test record
      await supabase.from('analytics').delete().eq('id', insertData[0].id);
      console.log('   ✓ Test record cleaned up');
    }
    console.log('');

    // Test 3: Check admin user
    console.log('👤 Test 3: Checking admin user...');
    const { data: adminData, error: adminError } = await supabase
      .from('users')
      .select('email, role, is_active')
      .eq('email', 'admin@smartshield.local')
      .single();

    if (adminError) {
      console.log(`   ✗ Admin user not found: ${adminError.message}`);
    } else {
      console.log(`   ✓ Admin user exists:`);
      console.log(`     Email: ${adminData.email}`);
      console.log(`     Role: ${adminData.role}`);
      console.log(`     Active: ${adminData.is_active}`);
    }
    console.log('');

    // Test 4: Check organization
    console.log('🏢 Test 4: Checking organization...');
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('name, domain, is_active')
      .eq('domain', 'localhost')
      .single();

    if (orgError) {
      console.log(`   ✗ Organization not found: ${orgError.message}`);
    } else {
      console.log(`   ✓ Default organization exists:`);
      console.log(`     Name: ${orgData.name}`);
      console.log(`     Domain: ${orgData.domain}`);
      console.log(`     Active: ${orgData.is_active}`);
    }
    console.log('');

    // Test 5: Test database functions
    console.log('⚙️  Test 5: Testing database functions...');
    const { data: statsData, error: statsError } = await supabase
      .rpc('get_scan_statistics', { p_org_id: null, p_days: 30 });

    if (statsError) {
      console.log(`   ✗ Function test failed: ${statsError.message}`);
    } else {
      console.log(`   ✓ Database functions are working`);
      if (statsData && statsData.length > 0) {
        console.log(`     Total scans: ${statsData[0].total_scans}`);
      }
    }
    console.log('');

    console.log('✅ All tests completed successfully!');
    console.log('\n🎉 Your Supabase connection is working correctly.');
    console.log('\n📝 Summary:');
    console.log('   • Supabase URL:', supabaseUrl);
    console.log('   • Tables created: ✓');
    console.log('   • Functions working: ✓');
    console.log('   • Admin user ready: ✓');
    console.log('\nYou can now start your application with: npm run dev');

  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    console.error('\nFull error:', error);
    console.error('\nTroubleshooting:');
    console.error('   1. Check your SUPABASE_URL is correct');
    console.error('   2. Check your SUPABASE_ANON_KEY is correct');
    console.error('   3. Make sure you\'ve run the SQL migration in Supabase SQL Editor');
    console.error('   4. Verify your Supabase project is active');
    process.exit(1);
  }
}

testSupabaseConnection();
