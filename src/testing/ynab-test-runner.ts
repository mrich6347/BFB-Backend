import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';

// Simple test scenario structure
export interface TestScenario {
  name: string;
  description: string;
  steps: TestStep[];
  expectedFinalState: ExpectedState;
}

export interface TestStep {
  action: 'create_budget' | 'create_account' | 'create_category_group' | 'create_category' |
          'create_transaction' | 'delete_transaction' | 'update_transaction' | 'delete_category' |
          'assign_money' | 'move_money_to_ready_to_assign' | 'get_state' | 'trigger_month_rollover';
  description: string;
  params: any;
  expectedResult?: any;
}

export interface ExpectedState {
  readyToAssign: number;
  accounts: { [name: string]: AccountState };
  categories: { [name: string]: CategoryState };
}

export interface AccountState {
  account_balance: number;
  cleared_balance: number;
  uncleared_balance: number;
  working_balance: number;
}

export interface CategoryState {
  assigned: number;
  activity: number;
  available: number;
}

export class YnabTestRunner {
  private app: INestApplication;
  private authToken: string;
  private userId: string;
  private testData: any = {};

  async initialize() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    this.app = moduleFixture.createNestApplication();
    await this.app.init();

    // Set up test user and auth (you'll need to implement this based on your auth system)
    await this.setupTestUser();
  }

  async runScenario(scenario: TestScenario): Promise<TestResult> {
    console.log(`\n🧪 Running Test: ${scenario.name}`);
    console.log(`📝 Description: ${scenario.description}\n`);

    const result: TestResult = {
      scenario: scenario.name,
      success: false,
      steps: [],
      finalState: null,
      errors: [],
      executionTime: Date.now()
    };

    try {
      // Clean database before starting test
      console.log('🧹 Cleaning database before test...');
      await this.cleanDatabase();
      console.log('✅ Database cleaned\n');

      // Execute each step
      let lastStepResult: any = null;
      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        console.log(`📍 Step ${i + 1}: ${step.description}`);

        const stepResult = await this.executeStep(step);
        result.steps.push(stepResult);

        if (!stepResult.success) {
          result.errors.push(`Step ${i + 1} failed: ${stepResult.error}`);
          break;
        }

        // Store the result if it's a get_state action (for final state comparison)
        if (step.action === 'get_state' || step.action === 'trigger_month_rollover') {
          lastStepResult = stepResult.data;
        }
      }

      // Use the last state result if available, otherwise get current state
      result.finalState = lastStepResult || await this.getCurrentState();
      
      // Compare with expected state
      const comparison = this.compareStates(result.finalState, scenario.expectedFinalState);
      result.success = comparison.success;
      result.errors.push(...comparison.errors);

      // Print results
      this.printResults(result, scenario.expectedFinalState);

    } catch (error) {
      result.errors.push(`Test execution failed: ${error.message}`);
    }

    result.executionTime = Date.now() - result.executionTime;
    return result;
  }

  private async executeStep(step: TestStep): Promise<StepResult> {
    try {
      switch (step.action) {
        case 'create_budget':
          return await this.createBudget(step.params);
        case 'create_account':
          return await this.createAccount(step.params);
        case 'create_category_group':
          return await this.createCategoryGroup(step.params);
        case 'create_category':
          return await this.createCategory(step.params);
        case 'create_transaction':
          return await this.createTransaction(step.params);
        case 'delete_transaction':
          return await this.deleteTransaction(step.params);
        case 'update_transaction':
          return await this.updateTransaction(step.params);
        case 'delete_category':
          return await this.deleteCategory(step.params);
        case 'assign_money':
          return await this.assignMoney(step.params);
        case 'move_money_to_ready_to_assign':
          return await this.moveMoneyToReadyToAssign(step.params);
        case 'get_state':
          return await this.getState(step.params);
        case 'trigger_month_rollover':
          return await this.triggerMonthRollover(step.params);
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }
    } catch (error) {
      return { success: false, error: error.message, data: null };
    }
  }

  private async createBudget(params: any): Promise<StepResult> {
    const response = await request(this.app.getHttpServer())
      .post('/budgets')
      .set('Authorization', `Bearer ${this.authToken}`)
      .send(params);

    if (response.status === 201) {
      this.testData.budgetId = response.body.id;
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to create budget' };
  }

  private async createAccount(params: any): Promise<StepResult> {
    // Generate a UUID for the account
    const accountId = this.generateUUID();

    const response = await request(this.app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${this.authToken}`)
      .send({
        ...params,
        id: accountId,
        budget_id: this.testData.budgetId
      });

    if (response.status === 201) {
      this.testData.accounts = this.testData.accounts || {};
      this.testData.accounts[params.name] = response.body.account.id;
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to create account' };
  }

  private async createCategoryGroup(params: any): Promise<StepResult> {
    const response = await request(this.app.getHttpServer())
      .post('/category-groups')
      .set('Authorization', `Bearer ${this.authToken}`)
      .send({ ...params, budget_id: this.testData.budgetId });

    if (response.status === 201) {
      this.testData.categoryGroups = this.testData.categoryGroups || {};
      this.testData.categoryGroups[params.name] = response.body.id;
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to create category group' };
  }

  private async createCategory(params: any): Promise<StepResult> {
    const categoryGroupId = this.testData.categoryGroups[params.category_group_name];
    const response = await request(this.app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${this.authToken}`)
      .send({
        name: params.name,
        category_group_id: categoryGroupId,
        budget_id: this.testData.budgetId
      });

    if (response.status === 201) {
      this.testData.categories = this.testData.categories || {};
      this.testData.categories[params.name] = response.body.id;
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to create category' };
  }

  private async createTransaction(params: any): Promise<StepResult> {
    const accountId = this.testData.accounts[params.account_name];

    // Find category ID by name from the current state
    let categoryId = null;
    if (params.category_name) {
      const currentState = await this.getCurrentState();
      const category = currentState.categories.find(c => c.name === params.category_name);
      if (category) {
        categoryId = category.id;
      } else {
        return { success: false, error: `Category '${params.category_name}' not found` };
      }
    }

    const response = await request(this.app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${this.authToken}`)
      .send({
        account_id: accountId,
        category_id: categoryId || 'ready-to-assign',
        payee: params.payee,
        memo: params.memo,
        amount: params.amount,
        date: params.date,
        is_cleared: params.is_cleared || false
      });

    if (response.status === 201) {
      this.testData.transactions = this.testData.transactions || {};
      this.testData.transactions[params.payee] = response.body.id;
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to create transaction' };
  }

  private async deleteTransaction(params: any): Promise<StepResult> {
    const transactionId = this.testData.transactions[params.payee];
    const response = await request(this.app.getHttpServer())
      .delete(`/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status === 200 || response.status === 204) {
      delete this.testData.transactions[params.payee];

      // Add a small delay to ensure database changes are committed
      // This prevents race conditions where the final state is retrieved
      // before the deletion and account balance updates are fully committed
      await new Promise(resolve => setTimeout(resolve, 100));

      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to delete transaction' };
  }

  private async updateTransaction(params: any): Promise<StepResult> {
    const transactionId = this.testData.transactions[params.payee];
    const response = await request(this.app.getHttpServer())
      .patch(`/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${this.authToken}`)
      .send({ amount: params.amount });

    if (response.status === 200) {
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to update transaction' };
  }

  private async deleteCategory(params: any): Promise<StepResult> {
    // Find category ID by name from the current state (same approach as other methods)
    let categoryId = null;
    if (params.category_name) {
      const currentState = await this.getCurrentState();
      const category = currentState.categories.find(c => c.name === params.category_name);
      if (category) {
        categoryId = category.id;
      } else {
        return { success: false, error: `Category '${params.category_name}' not found` };
      }
    }

    const response = await request(this.app.getHttpServer())
      .delete(`/categories/${categoryId}`)
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status === 200) {
      // Remove from testData if it was stored there
      if (this.testData.categories && this.testData.categories[params.category_name]) {
        delete this.testData.categories[params.category_name];
      }
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to delete category' };
  }

  private async assignMoney(params: any): Promise<StepResult> {
    // Find category ID by name from the current state (same approach as createTransaction)
    let categoryId = null;
    if (params.category_name) {
      const currentState = await this.getCurrentState();
      const category = currentState.categories.find(c => c.name === params.category_name);
      if (category) {
        categoryId = category.id;
      } else {
        return { success: false, error: `Category '${params.category_name}' not found` };
      }
    }

    // Use current month for the assignment
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const response = await request(this.app.getHttpServer())
      .post('/categories/pull-from-ready-to-assign')
      .set('Authorization', `Bearer ${this.authToken}`)
      .send({
        destinationCategoryId: categoryId,
        amount: params.amount,
        year: year,
        month: month
      });

    if (response.status === 201) {
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to assign money' };
  }

  private async moveMoneyToReadyToAssign(params: any): Promise<StepResult> {
    // Find category ID by name from the current state
    let categoryId = null;
    if (params.category_name) {
      const currentState = await this.getCurrentState();
      const category = currentState.categories.find(c => c.name === params.category_name);
      if (category) {
        categoryId = category.id;
      } else {
        return { success: false, error: `Category '${params.category_name}' not found` };
      }
    }

    // Use current month for the move
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const response = await request(this.app.getHttpServer())
      .post('/categories/move-money-to-ready-to-assign')
      .set('Authorization', `Bearer ${this.authToken}`)
      .send({
        sourceCategoryId: categoryId,
        amount: params.amount,
        year: year,
        month: month
      });

    if (response.status === 201) {
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to move money to ready to assign' };
  }

  private async getState(params?: any): Promise<StepResult> {
    const state = await this.getCurrentState(params);
    return { success: true, data: state };
  }

  private async triggerMonthRollover(params: any): Promise<StepResult> {
    // Request main data with user date context for the target month
    const response = await request(this.app.getHttpServer())
      .get(`/main-data/${this.testData.budgetId}`)
      .set('Authorization', `Bearer ${this.authToken}`)
      .query({
        userDate: params.userDate,
        userYear: params.userYear,
        userMonth: params.userMonth
      });

    if (response.status === 200) {
      return { success: true, data: response.body };
    }
    return { success: false, error: response.body.message || 'Failed to trigger month rollover' };
  }

  private async getCurrentState(params?: any): Promise<any> {
    let url = `/main-data/${this.testData.budgetId}`;

    // Add query parameters if provided
    if (params?.userDate || params?.userYear || params?.userMonth) {
      const queryParams = new URLSearchParams();
      if (params.userDate) queryParams.append('userDate', params.userDate);
      if (params.userYear) queryParams.append('userYear', params.userYear.toString());
      if (params.userMonth) queryParams.append('userMonth', params.userMonth.toString());
      url += `?${queryParams.toString()}`;
      console.log('🔍 getCurrentState called with URL:', url);
    } else {
      console.log('🔍 getCurrentState called without date context, URL:', url);
    }

    const response = await request(this.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${this.authToken}`);

    return response.body;
  }

  private compareStates(actual: any, expected: ExpectedState): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    // Compare Ready to Assign
    if (actual.readyToAssign !== expected.readyToAssign) {
      errors.push(`Ready to Assign: expected ${expected.readyToAssign}, got ${actual.readyToAssign}`);
    }

    // Compare accounts
    for (const [accountName, expectedAccount] of Object.entries(expected.accounts)) {
      const actualAccount = actual.accounts.find(a => a.name === accountName);
      if (!actualAccount) {
        errors.push(`Account '${accountName}' not found`);
        continue;
      }

      for (const [field, expectedValue] of Object.entries(expectedAccount)) {
        if (actualAccount[field] !== expectedValue) {
          errors.push(`Account '${accountName}' ${field}: expected ${expectedValue}, got ${actualAccount[field]}`);
        }
      }
    }

    // Compare categories
    for (const [categoryName, expectedCategory] of Object.entries(expected.categories)) {
      // Find all categories with this name
      const matchingCategories = actual.categories.filter(cat => cat.name === categoryName);

      // Find the category balance for each matching category
      let actualCategory = null;
      for (const cat of matchingCategories) {
        const balance = actual.categoryBalances.find(c => c.category_id === cat.id);
        if (balance) {
          actualCategory = balance;
          break; // Use the first one that has a balance record
        }
      }

      if (!actualCategory) {
        errors.push(`Category '${categoryName}' not found in categoryBalances`);
        continue;
      }

      for (const [field, expectedValue] of Object.entries(expectedCategory)) {
        if (actualCategory[field] !== expectedValue) {
          errors.push(`Category '${categoryName}' ${field}: expected ${expectedValue}, got ${actualCategory[field]}`);
        }
      }
    }

    return { success: errors.length === 0, errors };
  }

  private printResults(result: TestResult, expected: ExpectedState) {
    console.log('\n📊 TEST RESULTS');
    console.log('================');
    console.log(`Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Execution Time: ${result.executionTime}ms`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }

    console.log('\n📈 FINAL STATE COMPARISON:');
    console.log('Expected vs Actual:');
    console.log(JSON.stringify({ expected, actual: result.finalState }, null, 2));
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private async setupTestUser() {
    // Using updated auth token provided by user
    this.authToken = 'eyJhbGciOiJIUzI1NiIsImtpZCI6ImZOODlYcTM1akNFdlFBQloiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2Z4enRveWJma2ltb3lub3hhenBiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI0MDIzYTNlOC0yMGMzLTRjZGEtYTEyNS0yYjhhNWE4NGZhNzAiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUwMDQ0NjEzLCJpYXQiOjE3NTAwNDEwMTMsImVtYWlsIjoicmljaC5tYXR0aGV3akBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoicmljaC5tYXR0aGV3akBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiI0MDIzYTNlOC0yMGMzLTRjZGEtYTEyNS0yYjhhNWE4NGZhNzAifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc1MDAxNTIxOX1dLCJzZXNzaW9uX2lkIjoiNjM0MjQxYzItOWQ3OS00NjU3LTg2MzQtYzhjNWRlYzliOWE1IiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.OKHeSQT1IGKiuLlI-hfyESf-0sSlsP686H9shdnYKT8';
    this.userId = '4023a3e8-20c3-4cda-a125-2b8a5a84fa70'; // Extracted from JWT payload

    console.log('🔐 Using updated auth token');
    console.log('👤 Using user ID:', this.userId);
  }

  private async cleanDatabase(): Promise<void> {
    const response = await request(this.app.getHttpServer())
      .post('/database-management/nuke')
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status !== 201) {
      throw new Error(`Failed to clean database: ${response.body.message || 'Unknown error'}`);
    }
  }

  async cleanup() {
    await this.app.close();
  }
}

interface TestResult {
  scenario: string;
  success: boolean;
  steps: StepResult[];
  finalState: any;
  errors: string[];
  executionTime: number;
}

interface StepResult {
  success: boolean;
  error?: string;
  data?: any;
}
