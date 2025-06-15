/**
 * Interface for user date context to handle timezone differences
 * between client and server
 */
export interface UserDateContext {
  /** User's current date in YYYY-MM-DD format */
  userDate: string;
  
  /** User's current year */
  userYear: number;
  
  /** User's current month (1-12) */
  userMonth: number;
}

/**
 * Helper type for DTOs that may include user date context
 */
export interface WithUserDateContext {
  userDate?: string;
  userYear?: number;
  userMonth?: number;
}

/**
 * Utility functions for working with user date context
 */
export class UserDateContextUtils {
  /**
   * Extract user date context from DTO or use server fallback
   */
  static getCurrentUserDate(context?: WithUserDateContext): { year: number; month: number; date: string } {
    if (context?.userYear && context?.userMonth && context?.userDate) {
      return {
        year: context.userYear,
        month: context.userMonth,
        date: context.userDate
      };
    }
    
    // Fallback to server time if not provided
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      date: now.toISOString().split('T')[0]
    };
  }

  /**
   * Validate that a transaction date is not in the future based on user's current date
   */
  static validateTransactionDate(transactionDate: string, userCurrentDate?: string): boolean {
    const transactionDateObj = new Date(transactionDate);
    
    if (userCurrentDate) {
      const userCurrentDateObj = new Date(userCurrentDate);
      userCurrentDateObj.setHours(23, 59, 59, 999); // End of user's current day
      return transactionDateObj <= userCurrentDateObj;
    }
    
    // Fallback to server time validation
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return transactionDateObj <= today;
  }

  /**
   * Check if a transaction date is in the current month for the user
   */
  static isCurrentMonth(transactionDate: string, context?: WithUserDateContext): boolean {
    const transactionDateObj = new Date(transactionDate);
    const transactionYear = transactionDateObj.getFullYear();
    const transactionMonth = transactionDateObj.getMonth() + 1;
    
    const { year: currentYear, month: currentMonth } = this.getCurrentUserDate(context);
    
    return transactionYear === currentYear && transactionMonth === currentMonth;
  }

  /**
   * Get year and month from a date string
   */
  static getYearMonthFromDate(dateString: string): { year: number; month: number } {
    const date = new Date(dateString);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1
    };
  }
}
