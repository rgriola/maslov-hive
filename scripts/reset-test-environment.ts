// Reset test environment - clears database and .env.local agent configs
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

async function main() {
  console.log('\n🔄 Resetting Bot-Talker Test Environment\n');
  console.log('='.repeat(50));

  // Reset database
  console.log('\n1️⃣  Resetting database...');
  try {
    execSync('npx prisma migrate reset --force', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('✅ Database reset complete\n');
  } catch (error) {
    console.log('❌ Database reset failed');
    console.log('   Make sure PostgreSQL is running');
    process.exit(1);
  }

  // Clean .env.local agent entries
  console.log('2️⃣  Cleaning agent credentials from .env.local...');
  const envPath = path.join(process.cwd(), '.env.local');
  
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf-8');
    
    // Remove agent-specific entries
    const keysToRemove = [
      'AGENT_1_API_KEY',
      'AGENT_2_API_KEY',
      'AGENT_1_BSKY_HANDLE',
      'AGENT_1_BSKY_PASSWORD',
      'AGENT_2_BSKY_HANDLE',
      'AGENT_2_BSKY_PASSWORD',
    ];
    
    for (const key of keysToRemove) {
      content = content.replace(new RegExp(`^${key}=.*\n?`, 'gm'), '');
    }
    
    fs.writeFileSync(envPath, content.trim() + '\n');
    console.log('✅ Agent credentials cleared\n');
  } else {
    console.log('⏭️  No .env.local file found\n');
  }

  console.log('='.repeat(50));
  console.log('🎉 Reset Complete!\n');
  console.log('To set up fresh agents, run:');
  console.log('  npm run setup\n');
}

main().catch(error => {
  console.error('Reset failed:', error);
  process.exit(1);
});
