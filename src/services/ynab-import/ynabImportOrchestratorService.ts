import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { YnabCsvParser } from '../../utils/ynabCsvParser';
import { YnabCategoryImportService } from './ynabCategoryImportService';
import { CreateBudgetDto, BudgetResponse } from '../../domains/budgets/DTO/budget.dto';
import * as yauzl from 'yauzl';
import * as fs from 'fs';

export interface YnabImportResult {
  success: boolean;
  budget?: BudgetResponse;
  categoryGroupsCount?: number;
  categoriesCount?: number;
  error?: string;
  details?: string;
}

export interface YnabImportRequest {
  budgetName: string;
  currency?: string;
  currencyPlacement?: string;
  numberFormat?: string;
  dateFormat?: string;
}

@Injectable()
export class YnabImportOrchestratorService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly categoryImportService: YnabCategoryImportService
  ) {}

  /**
   * Import YNAB budget from uploaded zip file
   */
  async importFromZip(
    zipFilePath: string,
    importRequest: YnabImportRequest,
    userId: string,
    authToken: string
  ): Promise<YnabImportResult> {
    try {
      // Step 1: Extract Plan.csv from zip file
      const planCsvContent = await this.extractPlanCsvFromZip(zipFilePath);
      
      // Step 2: Validate CSV structure
      if (!YnabCsvParser.validateCsvStructure(planCsvContent)) {
        return {
          success: false,
          error: 'Invalid YNAB export format',
          details: 'The Plan.csv file does not have the expected structure'
        };
      }

      // Step 3: Parse CSV data
      const parsedData = await YnabCsvParser.parsePlanCsv(planCsvContent);
      
      // Step 4: Create budget
      const budget = await this.createBudget(importRequest, userId, authToken);

      // Step 5: Import categories and category groups
      const categoryResult = await this.categoryImportService.importCategoriesAndGroups(
        parsedData,
        budget.id,
        userId,
        authToken
      );

      return {
        success: true,
        budget,
        categoryGroupsCount: categoryResult.categoryGroupsCount,
        categoriesCount: categoryResult.categoriesCount
      };

    } catch (error) {
      console.error('YNAB import error:', error);
      return {
        success: false,
        error: 'Import failed',
        details: error.message
      };
    } finally {
      // Clean up temporary file
      try {
        if (fs.existsSync(zipFilePath)) {
          fs.unlinkSync(zipFilePath);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }
    }
  }

  /**
   * Extract Plan.csv content from YNAB zip file
   */
  private async extractPlanCsvFromZip(zipFilePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(new Error(`Failed to open zip file: ${err.message}`));
          return;
        }

        let planCsvFound = false;
        let csvContent = '';

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          // Look for Plan.csv file (case insensitive)
          if (entry.fileName.toLowerCase().includes('plan.csv')) {
            planCsvFound = true;
            
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(new Error(`Failed to read Plan.csv: ${err.message}`));
                return;
              }

              const chunks: Buffer[] = [];
              readStream.on('data', (chunk) => chunks.push(chunk));
              readStream.on('end', () => {
                csvContent = Buffer.concat(chunks).toString('utf8');
                zipfile.close();
                resolve(csvContent);
              });
              readStream.on('error', (error) => {
                reject(new Error(`Error reading Plan.csv: ${error.message}`));
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          if (!planCsvFound) {
            reject(new Error('Plan.csv not found in the uploaded zip file'));
          }
        });

        zipfile.on('error', (error) => {
          reject(new Error(`Zip file error: ${error.message}`));
        });
      });
    });
  }

  /**
   * Create the budget
   */
  private async createBudget(
    importRequest: YnabImportRequest,
    userId: string,
    authToken: string
  ): Promise<BudgetResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const budgetDto: CreateBudgetDto = {
      name: importRequest.budgetName,
      currency: importRequest.currency || 'USD',
      currency_placement: importRequest.currencyPlacement as any || 'BEFORE',
      number_format: importRequest.numberFormat as any || 'DOT_COMMA',
      date_format: importRequest.dateFormat as any || 'US_SLASH'
    };

    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .insert([{ ...budgetDto, user_id: userId }])
      .select('currency, currency_placement, date_format, id, name, number_format, updated_at')
      .single();

    if (budgetError) {
      throw new Error(`Failed to create budget: ${budgetError.message}`);
    }

    return budget;
  }
}
