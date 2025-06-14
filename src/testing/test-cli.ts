#!/usr/bin/env node

import { YnabTestRunner, TestScenario } from './ynab-test-runner';
import * as fs from 'fs';
import * as path from 'path';

class TestCLI {
  private testRunner: YnabTestRunner;

  async initialize() {
    console.log('🚀 Initializing YNAB Test Runner...');
    this.testRunner = new YnabTestRunner();
    await this.testRunner.initialize();
    console.log('✅ Test Runner initialized\n');
  }

  async runScenario(scenarioName: string) {
    const scenarioPath = path.join(__dirname, 'scenarios', scenarioName);
    
    if (!fs.existsSync(scenarioPath)) {
      console.log(`❌ Scenario file not found: ${scenarioPath}`);
      this.listAvailableScenarios();
      return;
    }

    console.log(`📂 Loading scenario: ${scenarioName}`);
    const scenario: TestScenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
    
    const result = await this.testRunner.runScenario(scenario);
    
    console.log('\n🎯 NEXT STEPS:');
    if (result.success) {
      console.log('✅ Test passed! The logic matches YNAB behavior.');
    } else {
      console.log('❌ Test failed. Here\'s what to fix:');
      result.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      console.log('\n💡 Suggested workflow:');
      console.log('   1. Examine the differences above');
      console.log('   2. Fix the backend logic');
      console.log('   3. Re-run this test');
      console.log('   4. Repeat until test passes');
    }
  }

  async runInteractiveMode() {
    console.log('🎮 Interactive Test Mode');
    console.log('========================');
    console.log('Available commands:');
    console.log('  run <scenario-name>  - Run a specific scenario');
    console.log('  list                 - List available scenarios');
    console.log('  create               - Create a new scenario interactively');
    console.log('  exit                 - Exit interactive mode');
    console.log('');

    // Simple interactive loop (in a real implementation, you'd use readline)
    const scenarios = this.getAvailableScenarios();
    if (scenarios.length > 0) {
      console.log('🚀 Auto-running first available scenario...');
      await this.runScenario(scenarios[0]);
    }
  }

  listAvailableScenarios() {
    console.log('\n📋 Available Test Scenarios:');
    console.log('============================');
    
    const scenarios = this.getAvailableScenarios();
    if (scenarios.length === 0) {
      console.log('No scenarios found in the scenarios directory.');
      return;
    }

    scenarios.forEach((scenario, index) => {
      const scenarioPath = path.join(__dirname, 'scenarios', scenario);
      try {
        const scenarioData: TestScenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
        console.log(`${index + 1}. ${scenario}`);
        console.log(`   📝 ${scenarioData.description}`);
        console.log(`   📊 ${scenarioData.steps.length} steps`);
        console.log('');
      } catch (error) {
        console.log(`${index + 1}. ${scenario} (⚠️  Invalid JSON)`);
      }
    });
  }

  private getAvailableScenarios(): string[] {
    const scenariosDir = path.join(__dirname, 'scenarios');
    if (!fs.existsSync(scenariosDir)) {
      fs.mkdirSync(scenariosDir, { recursive: true });
      return [];
    }
    
    return fs.readdirSync(scenariosDir)
      .filter(file => file.endsWith('.json'))
      .sort();
  }

  async createNewScenario() {
    console.log('🛠️  Create New Scenario');
    console.log('======================');
    console.log('This feature helps you create new test scenarios.');
    console.log('For now, you can copy and modify existing scenarios in the scenarios/ directory.');
    
    const template = {
      name: "New Test Scenario",
      description: "Describe what this test verifies",
      steps: [
        {
          action: "create_budget",
          description: "Create test budget",
          params: {
            name: "Test Budget",
            currency: "USD"
          }
        }
      ],
      expectedFinalState: {
        readyToAssign: 0,
        accounts: {},
        categories: {}
      }
    };

    const templatePath = path.join(__dirname, 'scenarios', 'template.json');
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
    console.log(`📄 Template created at: ${templatePath}`);
  }

  async cleanup() {
    if (this.testRunner) {
      await this.testRunner.cleanup();
    }
  }
}

// Main execution
async function main() {
  const cli = new TestCLI();
  
  try {
    await cli.initialize();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
      case 'run':
        const scenarioName = args[1];
        if (!scenarioName) {
          console.log('❌ Please specify a scenario name: npm run test:scenario run <scenario-name>');
          cli.listAvailableScenarios();
          break;
        }
        await cli.runScenario(scenarioName);
        break;
        
      case 'list':
        cli.listAvailableScenarios();
        break;
        
      case 'create':
        await cli.createNewScenario();
        break;
        
      case 'interactive':
      default:
        await cli.runInteractiveMode();
        break;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await cli.cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { TestCLI };
