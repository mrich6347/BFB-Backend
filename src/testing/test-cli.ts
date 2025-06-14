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

  async runAllScenarios() {
    console.log('🚀 Running ALL Test Scenarios');
    console.log('==============================');

    const scenarios = this.getAvailableScenarios();
    if (scenarios.length === 0) {
      console.log('❌ No scenarios found to run.');
      return;
    }

    console.log(`📊 Found ${scenarios.length} scenarios to run\n`);

    const results: { scenario: string; success: boolean; errors: string[] }[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🧪 Running Test ${i + 1}/${scenarios.length}: ${scenario}`);
      console.log(`${'='.repeat(60)}`);

      try {
        const scenarioPath = path.join(__dirname, 'scenarios', scenario);
        const scenarioData: TestScenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));

        const result = await this.testRunner.runScenario(scenarioData);
        results.push({
          scenario,
          success: result.success,
          errors: result.errors
        });

        if (result.success) {
          console.log('✅ PASSED');
        } else {
          console.log('❌ FAILED');
          result.errors.forEach((error, index) => {
            console.log(`   ${index + 1}. ${error}`);
          });
        }
      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        results.push({
          scenario,
          success: false,
          errors: [error.message]
        });
      }
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 FINAL SUMMARY');
    console.log(`${'='.repeat(60)}`);

    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;

    console.log(`✅ Passed: ${passed}/${results.length}`);
    console.log(`❌ Failed: ${failed}/${results.length}`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.filter(r => !r.success).forEach((result, index) => {
        console.log(`${index + 1}. ${result.scenario}`);
        result.errors.forEach(error => console.log(`   - ${error}`));
      });
    }

    console.log(`\n🎯 Overall Success Rate: ${Math.round((passed / results.length) * 100)}%`);
  }

  async runCategoryScenarios(category: string) {
    console.log(`🚀 Running ${category.toUpperCase()} Test Scenarios`);
    console.log('==============================');

    const allScenarios = this.getAvailableScenarios();
    const categoryScenarios = allScenarios.filter(scenario =>
      scenario.startsWith(category + path.sep) ||
      (category === 'uncategorized' && !scenario.includes(path.sep))
    );

    if (categoryScenarios.length === 0) {
      console.log(`❌ No scenarios found in category: ${category}`);
      return;
    }

    console.log(`📊 Found ${categoryScenarios.length} scenarios in ${category}\n`);

    for (let i = 0; i < categoryScenarios.length; i++) {
      const scenario = categoryScenarios[i];
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🧪 Running ${i + 1}/${categoryScenarios.length}: ${scenario}`);
      console.log(`${'='.repeat(50)}`);

      await this.runScenario(scenario);
    }
  }

  async runInteractiveMode() {
    console.log('🎮 Interactive Test Mode');
    console.log('========================');
    console.log('Available commands:');
    console.log('  run <scenario-name>     - Run a specific scenario');
    console.log('  run-all                 - Run ALL scenarios sequentially');
    console.log('  run-category <category> - Run all scenarios in a category');
    console.log('  list                    - List available scenarios');
    console.log('  create                  - Create a new scenario interactively');
    console.log('  exit                    - Exit interactive mode');
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

    // Group scenarios by category
    const categorizedScenarios: { [category: string]: string[] } = {};
    scenarios.forEach(scenario => {
      const parts = scenario.split(path.sep);
      if (parts.length > 1) {
        const category = parts[0];
        if (!categorizedScenarios[category]) {
          categorizedScenarios[category] = [];
        }
        categorizedScenarios[category].push(scenario);
      } else {
        if (!categorizedScenarios['uncategorized']) {
          categorizedScenarios['uncategorized'] = [];
        }
        categorizedScenarios['uncategorized'].push(scenario);
      }
    });

    let totalIndex = 1;
    Object.keys(categorizedScenarios).sort().forEach(category => {
      console.log(`\n📁 ${category.toUpperCase()}:`);
      categorizedScenarios[category].forEach(scenario => {
        const scenarioPath = path.join(__dirname, 'scenarios', scenario);
        try {
          const scenarioData: TestScenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
          console.log(`${totalIndex}. ${scenario}`);
          console.log(`   📝 ${scenarioData.description}`);
          console.log(`   📊 ${scenarioData.steps.length} steps`);
          console.log('');
          totalIndex++;
        } catch (error) {
          console.log(`${totalIndex}. ${scenario} (⚠️  Invalid JSON)`);
          totalIndex++;
        }
      });
    });

    console.log(`\n📊 Total scenarios: ${scenarios.length}`);
  }

  private getAvailableScenarios(): string[] {
    const scenariosDir = path.join(__dirname, 'scenarios');
    if (!fs.existsSync(scenariosDir)) {
      fs.mkdirSync(scenariosDir, { recursive: true });
      return [];
    }

    const scenarios: string[] = [];
    this.findScenariosRecursively(scenariosDir, '', scenarios);
    return scenarios.sort();
  }

  private findScenariosRecursively(dir: string, relativePath: string, scenarios: string[]) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const itemRelativePath = relativePath ? path.join(relativePath, item) : item;

      if (fs.statSync(fullPath).isDirectory()) {
        this.findScenariosRecursively(fullPath, itemRelativePath, scenarios);
      } else if (item.endsWith('.json')) {
        scenarios.push(itemRelativePath);
      }
    }
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

      case 'run-all':
        await cli.runAllScenarios();
        break;

      case 'run-category':
        const category = args[1];
        if (!category) {
          console.log('❌ Please specify a category: npm run test:scenario run-category <category-name>');
          console.log('Available categories: cash-transactions, overspending');
          break;
        }
        await cli.runCategoryScenarios(category);
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
