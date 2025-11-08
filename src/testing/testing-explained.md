# BFB Testing Framework - Simple Guide

## What is this?

Our testing framework lets you test the BFB backend by writing simple JSON files. It automatically:
- Logs in with a test user
- Cleans the database
- Runs your test steps
- Checks if the final state matches what you expected

## How to run tests

```bash
# Run all tests
source ~/.nvm/nvm.sh && nvm use 23 && npm run test:scenario:run-all

# Run one specific test
npm run test:scenario:run simple-cash-transaction.json
```

## How it works

1. **JSON file** describes what to do (create budget, add transaction, etc.)
2. **Test runner** executes each step by calling our API endpoints
3. **State checker** compares the final result with what you expected
4. **Report** shows if it passed or failed

## Writing JSON Test Files

Each test is a JSON file with three parts:

### 1. Basic Info
```json
{
  "name": "Simple Cash Transaction Test",
  "description": "Create budget, account, category, assign money, spend money"
}
```

### 2. Steps (what to do)
```json
"steps": [
  {
    "action": "create_budget",
    "description": "Create test budget",
    "params": {
      "name": "Test Budget",
      "currency": "USD"
    }
  },
  {
    "action": "create_account",
    "description": "Create checking account with $1000",
    "params": {
      "name": "Checking",
      "account_type": "CASH",
      "account_balance": 1000
    }
  },
  {
    "action": "create_category_group",
    "description": "Create category group",
    "params": {
      "name": "Monthly Expenses"
    }
  },
  {
    "action": "create_category",
    "description": "Create groceries category",
    "params": {
      "name": "Groceries",
      "category_group_name": "Monthly Expenses"
    }
  },
  {
    "action": "assign_money",
    "description": "Assign $100 to groceries",
    "params": {
      "category_name": "Groceries",
      "amount": 100
    }
  },
  {
    "action": "create_transaction",
    "description": "Spend $50 on groceries",
    "params": {
      "account_name": "Checking",
      "payee": "Store",
      "category_name": "Groceries",
      "amount": -50,
      "date": "2025-06-14"
    }
  }
]
```

### 3. Expected Result
```json
"expectedFinalState": {
  "readyToAssign": 900,
  "accounts": {
    "Checking": {
      "working_balance": 950
    }
  },
  "categories": {
    "Groceries": {
      "assigned": 100,
      "activity": -50,
      "available": 50
    }
  }
}
```

## Available Actions

**Budget**: `create_budget`
**Accounts**: `create_account`, `close_account`
**Categories**: `create_category_group`, `create_category`, `delete_category`
**Money**: `assign_money`, `move_money_to_ready_to_assign`
**Transactions**: `create_transaction`, `update_transaction`, `delete_transaction`
**Other**: `get_state`, `trigger_month_rollover`

## What happens when you run a test

1. **Setup**: Logs in as test user, cleans database
2. **Execute**: Runs each step in your JSON file (create budget, add transaction, etc.)
3. **Check**: Gets the final state and compares it to what you expected
4. **Report**: Shows ✅ PASSED or ❌ FAILED with details

## File locations

```
BFB-Backend/src/testing/
├── scenarios/                    # Your JSON test files go here
│   ├── cash-transactions/       # Tests for regular accounts
│   ├── credit-accounts/         # Tests for credit cards
│   ├── month-rollover/          # Tests for month transitions
│   └── overspending/            # Tests for negative balances
├── ynab-test-runner.ts          # Main test engine
└── test-cli.ts                  # Command line interface
```

## System Integration

The testing framework integrates deeply with the BFB backend system and external services:

### Supabase Authentication

The framework uses automated authentication with a dedicated test user:

```typescript
// Test user credentials (from environment variables)
const testEmail = process.env.TEST_USER_EMAIL || 'test.user@bfb.test';
const testPassword = process.env.TEST_USER_PASSWORD || 'test-password-123';

// Automatic login process
const supabase = createClient(supabaseUrl, supabaseKey);
const { data, error } = await supabase.auth.signInWithPassword({
  email: testEmail,
  password: testPassword
});

// Extract JWT token for API requests
this.authToken = data.session.access_token;
this.userId = data.user.id;
```

**Benefits of Automated Authentication**:
- No manual token management required
- Tests run independently without external setup
- Consistent authentication across all test scenarios
- Secure isolation using dedicated test user

### API Integration

The framework makes HTTP requests to BFB backend endpoints using the SuperTest library:

```typescript
// Example API call with authentication
const response = await request(this.app.getHttpServer())
  .post('/budgets')
  .set('Authorization', `Bearer ${this.authToken}`)
  .send({
    name: 'Test Budget',
    currency: 'USD',
    currency_placement: 'BEFORE'
  });
```

**Supported Endpoints**:
- `/budgets` - Budget management
- `/accounts` - Account operations
- `/categories` - Category management
- `/category-groups` - Category group operations
- `/transactions` - Transaction handling
- `/main-data/{budgetId}` - Complete application state

### Database Management

The framework includes sophisticated database management:

#### State Retrieval
```typescript
// Get complete application state
const response = await request(this.app.getHttpServer())
  .get(`/main-data/${this.testData.budgetId}`)
  .set('Authorization', `Bearer ${this.authToken}`)
  .query({
    userDate: '2025-06-21',
    userYear: 2025,
    userMonth: 6
  });
```

### Response Validation

The framework validates API responses at multiple levels:

#### HTTP Status Validation
```typescript
if (response.status === 201) {
  return { success: true, data: response.body };
}
return { success: false, error: response.body.message || 'Operation failed' };
```

#### Data Structure Validation
- Ensures required fields are present in responses
- Validates data types and formats
- Checks for proper ID generation and assignment

#### Business Logic Validation
- Compares calculated values (balances, available amounts)
- Validates YNAB-compliant behavior
- Ensures data consistency across related entities

## File Structure

The testing framework is organized in a clear, hierarchical structure:

```
BFB-Backend/src/testing/
├── testing-explained.md           # This documentation file
├── ynab-test-runner.ts           # Core test execution engine
├── test-cli.ts                   # Command-line interface
├── run-scenario.spec.ts          # Jest test integration
├── scenario-framework/           # Framework type definitions
│   └── types.ts                 # TypeScript interfaces
└── scenarios/                   # Test scenario configurations
    ├── cash-transactions/       # Cash account test scenarios
    │   ├── simple-cash-transaction.json
    │   └── cash-transaction-with-additional-assignment.json
    ├── credit-accounts/         # Credit card test scenarios
    │   ├── credit-account-creation.json
    │   └── credit-account-close.json
    ├── month-rollover/          # Month transition scenarios
    │   └── complete-month-rollover-test.json
    └── overspending/            # Overspending behavior tests
        └── ynab-overspending-test.json
```

### Core Files

#### `ynab-test-runner.ts`
The heart of the testing framework containing:
- Test execution logic
- API integration methods
- State comparison algorithms
- Authentication management
- Database cleanup procedures

#### `test-cli.ts`
Command-line interface providing:
- Individual scenario execution
- Batch test running
- Scenario listing and discovery
- Result formatting and reporting

#### `run-scenario.spec.ts`
Jest integration layer enabling:
- Integration with existing test infrastructure
- IDE test runner compatibility
- Continuous integration support

### Scenario Organization

Test scenarios are organized by functional area:

- **`cash-transactions/`**: Tests for checking and savings account operations
- **`credit-accounts/`**: Credit card account creation, transactions, and management
- **`month-rollover/`**: Month transition logic and balance carryover
- **`overspending/`**: Overspending behavior and negative category balances

## Running Tests

The framework provides multiple ways to execute tests depending on your needs:

### Prerequisites

Before running tests, ensure you have:

1. **Node.js Version**: Node.js 23 or higher
2. **Environment Setup**: Proper `.env` configuration
3. **Test User**: Configured test user in Supabase
4. **Database Access**: Connection to test database

### Environment Setup

```bash
# Navigate to backend directory
cd BFB-Backend

# Set up Node.js version
source ~/.nvm/nvm.sh && nvm use 23

# Install dependencies (if needed)
npm install
```

### Running All Tests

Execute all test scenarios in sequence:

```bash
# Run all scenarios with comprehensive reporting
npm run test:scenario:run-all
```

This command:
- Runs every JSON scenario file in the scenarios directory
- Provides summary results for each test
- Reports overall pass/fail statistics
- Shows detailed error information for failed tests

### Running Individual Tests

Execute a specific test scenario:

```bash
# Run a specific scenario file
npm run test:scenario:run simple-cash-transaction.json

# Run with custom scenario
npm run test:scenario:run credit-account-creation.json
```

### Running Tests by Category

Execute all tests in a specific category:

```bash
# Run all cash transaction tests
npm run test:scenario:run-category cash-transactions

# Run all credit account tests
npm run test:scenario:run-category credit-accounts
```

### Available NPM Scripts

The framework provides several NPM scripts for different testing needs:

```json
{
  "test:scenario": "ts-node src/testing/test-cli.ts",
  "test:scenario:run": "ts-node src/testing/test-cli.ts run",
  "test:scenario:run-all": "ts-node src/testing/test-cli.ts run-all",
  "test:scenario:run-category": "ts-node src/testing/test-cli.ts run-category",
  "test:scenario:list": "ts-node src/testing/test-cli.ts list",
  "test:scenario:users": "ts-node src/testing/test-cli.ts test-users"
}
```

### Jest Integration

Run tests through Jest for IDE integration:

```bash
# Run through Jest
npm run test:ynab

# Run with specific scenario
SCENARIO=simple-cash-transaction.json npm test
```

### Command-Line Options

The test CLI supports various options:

```bash
# List all available scenarios
npm run test:scenario:list

# Test user authentication
npm run test:scenario:users

# Run with verbose output
DEBUG=true npm run test:scenario:run-all
```
