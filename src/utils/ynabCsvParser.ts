import csv from 'csv-parser';
import { Readable } from 'stream';

export interface YnabPlanRow {
  month: string;
  categoryGroupCategory: string;
  categoryGroup: string;
  category: string;
  assigned: string;
  activity: string;
  available: string;
}

export interface ParsedYnabData {
  categoryGroups: YnabCategoryGroup[];
  categories: YnabCategory[];
}

export interface YnabCategoryGroup {
  name: string;
  displayOrder: number;
  isSystemGroup: boolean;
}

export interface YnabCategory {
  name: string;
  categoryGroupName: string;
  displayOrder: number;
}

export class YnabCsvParser {
  /**
   * Parse YNAB Plan.csv content and extract category structure
   */
  static async parsePlanCsv(csvContent: string): Promise<ParsedYnabData> {
    const rows: YnabPlanRow[] = [];
    
    return new Promise((resolve, reject) => {
      const stream = Readable.from([csvContent]);
      
      stream
        .pipe(csv({
          headers: ['month', 'categoryGroupCategory', 'categoryGroup', 'category', 'assigned', 'activity', 'available']
        }))
        .on('data', (row: YnabPlanRow) => {
          // Skip header row and any rows with header-like content
          if (row.month === 'Month' ||
              row.categoryGroup === 'Category Group' ||
              row.category === 'Category') {
            return;
          }

          // Only process rows with valid category group and category data
          if (row.categoryGroup && row.category &&
              row.categoryGroup.trim() && row.category.trim()) {
            rows.push(row);
          }
        })
        .on('end', () => {
          try {
            const parsedData = this.extractCategoryStructure(rows);
            resolve(parsedData);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        });
    });
  }

  /**
   * Extract unique category groups and categories from parsed CSV rows
   */
  private static extractCategoryStructure(rows: YnabPlanRow[]): ParsedYnabData {
    const categoryGroupMap = new Map<string, YnabCategoryGroup>();
    const categoryMap = new Map<string, YnabCategory>();
    
    // Process each row to extract unique category groups and categories
    rows.forEach((row, index) => {
      const groupName = this.cleanCategoryGroupName(row.categoryGroup);
      const categoryName = this.cleanCategoryName(row.category);
      
      // Skip empty names or generic header-like names
      if (!groupName || !categoryName ||
          groupName === 'Category Group' || categoryName === 'Category' ||
          groupName.toLowerCase().includes('category group') ||
          categoryName.toLowerCase().includes('category')) {
        return;
      }

      // Add category group if not already present
      if (!categoryGroupMap.has(groupName)) {
        categoryGroupMap.set(groupName, {
          name: groupName,
          displayOrder: categoryGroupMap.size,
          isSystemGroup: this.isSystemGroup(groupName)
        });
      }
      
      // Create unique key for category (group + category name)
      const categoryKey = `${groupName}::${categoryName}`;
      
      // Add category if not already present
      if (!categoryMap.has(categoryKey)) {
        categoryMap.set(categoryKey, {
          name: categoryName,
          categoryGroupName: groupName,
          displayOrder: this.getCategoryDisplayOrder(categoryName, groupName, categoryMap)
        });
      }
    });

    return {
      categoryGroups: Array.from(categoryGroupMap.values()),
      categories: Array.from(categoryMap.values())
    };
  }

  /**
   * Clean category group name by removing extra whitespace but preserving the full name
   */
  private static cleanCategoryGroupName(groupName: string): string {
    return groupName?.trim() || '';
  }

  /**
   * Keep the full category name exactly as it appears in YNAB
   * We want to preserve the complete category names including pricing/date info
   * Examples:
   * "Rent | $2200 | 1st (Manual)" -> "Rent | $2200 | 1st (Manual)"
   * "Groceries 🍌 | $250" -> "Groceries 🍌 | $250"
   * "Gas ⛽ | $120" -> "Gas ⛽ | $120"
   */
  private static cleanCategoryName(categoryName: string): string {
    if (!categoryName) return '';

    // Just trim whitespace, keep the full name exactly as it is in YNAB
    return categoryName.trim();
  }

  /**
   * Determine if a category group is a system group
   */
  private static isSystemGroup(groupName: string): boolean {
    const systemGroups = [
      'Credit Card Payments',
      'Hidden Categories'
    ];
    
    return systemGroups.includes(groupName);
  }

  /**
   * Get display order for a category within its group
   */
  private static getCategoryDisplayOrder(
    categoryName: string, 
    groupName: string, 
    existingCategories: Map<string, YnabCategory>
  ): number {
    // Count existing categories in the same group
    let count = 0;
    for (const category of existingCategories.values()) {
      if (category.categoryGroupName === groupName) {
        count++;
      }
    }
    return count;
  }

  /**
   * Validate that the CSV has the expected structure
   */
  static validateCsvStructure(csvContent: string): boolean {
    const lines = csvContent.split('\n');
    if (lines.length < 2) return false;

    // Check header row - should match YNAB Plan.csv format exactly
    const header = lines[0].toLowerCase();
    const expectedColumns = ['month', 'category group/category', 'category group', 'category'];

    // Validate that all expected columns are present
    const hasAllColumns = expectedColumns.every(col => header.includes(col.toLowerCase()));

    // Additional validation - check that we have some actual data rows
    const hasDataRows = lines.length > 1 && lines[1].trim().length > 0;

    return hasAllColumns && hasDataRows;
  }

  /**
   * Get summary statistics from parsed data
   */
  static getSummaryStats(data: ParsedYnabData): {
    totalCategoryGroups: number;
    totalCategories: number;
    systemGroups: number;
    regularGroups: number;
  } {
    const systemGroups = data.categoryGroups.filter(g => g.isSystemGroup).length;
    
    return {
      totalCategoryGroups: data.categoryGroups.length,
      totalCategories: data.categories.length,
      systemGroups,
      regularGroups: data.categoryGroups.length - systemGroups
    };
  }
}
