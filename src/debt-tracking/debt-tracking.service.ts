import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface DebtTrackingRecord {
  id: string;
  transaction_id: string;
  category_id: string;
  payment_category_id: string;
  debt_amount: number;
  covered_amount: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  budget_id: string;
}

@Injectable()
export class DebtTrackingService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Create a debt tracking record for uncovered spending
   */
  async createDebtRecord(
    transactionId: string,
    categoryId: string,
    paymentCategoryId: string,
    debtAmount: number,
    coveredAmount: number,
    budgetId: string,
    userId: string,
    authToken: string
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { error } = await supabase
      .from('credit_card_debt_tracking')
      .insert({
        transaction_id: transactionId,
        category_id: categoryId,
        payment_category_id: paymentCategoryId,
        debt_amount: debtAmount,
        covered_amount: coveredAmount,
        budget_id: budgetId,
        user_id: userId
      });

    if (error) {
      console.error('Error creating debt tracking record:', error);
      throw new Error(error.message);
    }

    console.log(`📝 Created debt tracking record: ${debtAmount} debt, ${coveredAmount} covered`);
  }

  /**
   * Update debt coverage for a specific record
   */
  async updateDebtCoverage(
    debtRecordId: string,
    additionalCoverage: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Get current record
    const { data: currentRecord, error: fetchError } = await supabase
      .from('credit_card_debt_tracking')
      .select('covered_amount')
      .eq('id', debtRecordId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const newCoveredAmount = (currentRecord.covered_amount || 0) + additionalCoverage;

    const { error: updateError } = await supabase
      .from('credit_card_debt_tracking')
      .update({
        covered_amount: newCoveredAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', debtRecordId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  /**
   * Get all uncovered debt records for a category (FIFO order)
   */
  async getUncoveredDebts(
    categoryId: string,
    userId: string,
    authToken: string
  ): Promise<DebtTrackingRecord[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data: debtRecords, error } = await supabase
      .from('credit_card_debt_tracking')
      .select('*')
      .eq('category_id', categoryId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }); // FIFO order

    if (error) {
      console.error('Error fetching debt records:', error);
      return [];
    }

    if (!debtRecords) return [];

    // Filter for only uncovered debts
    return debtRecords.filter(record => record.covered_amount < record.debt_amount);
  }

  /**
   * Get debt coverage status for a payment category
   */
  async getDebtCoverageStatus(
    paymentCategoryId: string,
    userId: string,
    authToken: string
  ): Promise<{
    totalDebt: number;
    coveredAmount: number;
    uncoveredDebt: number;
  }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data: debtRecords, error } = await supabase
      .from('credit_card_debt_tracking')
      .select('debt_amount, covered_amount')
      .eq('payment_category_id', paymentCategoryId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching debt coverage status:', error);
      return { totalDebt: 0, coveredAmount: 0, uncoveredDebt: 0 };
    }

    if (!debtRecords || debtRecords.length === 0) {
      return { totalDebt: 0, coveredAmount: 0, uncoveredDebt: 0 };
    }

    const totalDebt = debtRecords.reduce((sum, record) => sum + record.debt_amount, 0);
    const coveredAmount = debtRecords.reduce((sum, record) => sum + record.covered_amount, 0);
    const uncoveredDebt = totalDebt - coveredAmount;

    return { totalDebt, coveredAmount, uncoveredDebt };
  }

  /**
   * Get category debt summary (aggregate debt per category)
   */
  async getCategoryDebtSummary(
    categoryId: string,
    userId: string,
    authToken: string
  ): Promise<{
    totalDebt: number;
    coveredAmount: number;
    uncoveredDebt: number;
  }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data: debtRecords, error } = await supabase
      .from('credit_card_debt_tracking')
      .select('debt_amount, covered_amount')
      .eq('category_id', categoryId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching category debt summary:', error);
      return { totalDebt: 0, coveredAmount: 0, uncoveredDebt: 0 };
    }

    if (!debtRecords || debtRecords.length === 0) {
      return { totalDebt: 0, coveredAmount: 0, uncoveredDebt: 0 };
    }

    const totalDebt = debtRecords.reduce((sum, record) => sum + record.debt_amount, 0);
    const coveredAmount = debtRecords.reduce((sum, record) => sum + record.covered_amount, 0);
    const uncoveredDebt = totalDebt - coveredAmount;

    return { totalDebt, coveredAmount, uncoveredDebt };
  }

  /**
   * Get debt tracking records for a specific transaction
   */
  async getDebtRecordsForTransaction(
    transactionId: string,
    userId: string,
    authToken: string
  ): Promise<DebtTrackingRecord[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data: debtRecords, error } = await supabase
      .from('credit_card_debt_tracking')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching debt records for transaction:', error);
      return [];
    }

    return debtRecords || [];
  }

  /**
   * Remove debt tracking records for a transaction (used when transaction is deleted)
   */
  async removeDebtRecordsForTransaction(
    transactionId: string,
    userId: string,
    authToken: string
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // First get the records to see what we're deleting
    const recordsToDelete = await this.getDebtRecordsForTransaction(transactionId, userId, authToken);
    console.log(`🗑️ About to delete ${recordsToDelete.length} debt records for transaction ${transactionId}:`, recordsToDelete);

    const { error } = await supabase
      .from('credit_card_debt_tracking')
      .delete()
      .eq('transaction_id', transactionId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing debt tracking records:', error);
      throw new Error(error.message);
    }

    console.log(`✅ Successfully deleted ${recordsToDelete.length} debt records for transaction ${transactionId}`);
  }
}
