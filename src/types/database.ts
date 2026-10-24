// The shape of the database for TypeScript, in the same format the Supabase
// CLI generates (`supabase gen types typescript`). Written by hand for now;
// keep it in step with supabase/migrations. Postgres `bigint` arrives as a
// JSON number: safe here, because amounts stay below 2^53 (MAX_AMOUNT_MINOR).

type RuleKind = "expense" | "income" | "transfer" | "goal_contribution";

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: "cash" | "bank" | "mobile_money" | "card";
          currency: "GHS" | "USD";
          opening_balance_minor: number;
          opening_balance_on: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // Only the columns the app may write (see the GRANTs in the migration).
        Insert: {
          name: string;
          type: "cash" | "bank" | "mobile_money" | "card";
          currency: "GHS" | "USD";
          opening_balance_minor?: number;
          opening_balance_on?: string;
        };
        Update: {
          name?: string;
          type?: "cash" | "bank" | "mobile_money" | "card";
          currency?: "GHS" | "USD";
          opening_balance_minor?: number;
          opening_balance_on?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          kind: "expense" | "income";
          parent_id: string | null;
          name: string;
          system_key: string | null;
          sort_order: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          kind: "expense" | "income";
          parent_id?: string | null;
          name: string;
          sort_order?: number;
        };
        Update: {
          parent_id?: string | null;
          name?: string;
          sort_order?: number;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          kind: "expense" | "income" | "transfer";
          occurred_on: string;
          account_id: string;
          category_id: string | null;
          amount_minor: number;
          currency: "GHS" | "USD";
          // numeric arrives as a JSON number.
          fx_rate: number;
          fx_source: "none" | "auto" | "manual";
          fx_rate_date: string | null;
          amount_ghs_minor: number;
          account_amount_minor: number;
          to_account_id: string | null;
          to_amount_minor: number | null;
          parent_transaction_id: string | null;
          recurring_rule_id: string | null;
          occurrence_date: string | null;
          note: string;
          receipt_path: string | null;
          created_at: string;
          updated_at: string;
        };
        // The columns the app and the daily job may write (see the GRANTs in
        // the migrations; the database refuses the rest).
        Insert: {
          id?: string;
          user_id?: string;
          kind: "expense" | "income" | "transfer";
          occurred_on: string;
          account_id: string;
          category_id: string | null;
          to_account_id?: string | null;
          to_amount_minor?: number | null;
          recurring_rule_id?: string | null;
          occurrence_date?: string | null;
          amount_minor: number;
          currency: "GHS" | "USD";
          fx_rate?: number | string;
          fx_source?: "none" | "auto" | "manual";
          fx_rate_date?: string | null;
          amount_ghs_minor: number;
          account_amount_minor: number;
          note?: string;
        };
        Update: {
          kind?: "expense" | "income";
          occurred_on?: string;
          account_id?: string;
          category_id?: string;
          amount_minor?: number;
          currency?: "GHS" | "USD";
          fx_rate?: number | string;
          fx_source?: "none" | "auto" | "manual";
          fx_rate_date?: string | null;
          amount_ghs_minor?: number;
          account_amount_minor?: number;
          note?: string;
          // Undo of a transfer created by a recurring item (build step 7).
          recurring_rule_id?: string | null;
          occurrence_date?: string | null;
        };
        Relationships: [];
      };
      recurring_rules: {
        Row: {
          id: string;
          user_id: string;
          kind: RuleKind;
          // null only for a goal contribution (D-40).
          account_id: string | null;
          category_id: string | null;
          to_account_id: string | null;
          goal_id: string | null;
          amount_minor: number;
          currency: "GHS" | "USD";
          note: string;
          frequency: "weekly" | "monthly";
          weekday: number | null;
          day_of_month: number | null;
          starts_on: string;
          ends_on: string | null;
          next_run_on: string;
          paused: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          kind: RuleKind;
          account_id: string | null;
          category_id: string | null;
          to_account_id: string | null;
          goal_id: string | null;
          amount_minor: number;
          currency: "GHS" | "USD";
          note?: string;
          frequency: "weekly" | "monthly";
          weekday: number | null;
          day_of_month: number | null;
          starts_on: string;
          ends_on: string | null;
          next_run_on: string;
          paused?: boolean;
        };
        Update: {
          kind?: RuleKind;
          account_id?: string | null;
          category_id?: string | null;
          to_account_id?: string | null;
          goal_id?: string | null;
          amount_minor?: number;
          currency?: "GHS" | "USD";
          note?: string;
          frequency?: "weekly" | "monthly";
          weekday?: number | null;
          day_of_month?: number | null;
          starts_on?: string;
          ends_on?: string | null;
          next_run_on?: string;
          paused?: boolean;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          effective_from: string;
          amount_minor: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { category_id: string; effective_from: string; amount_minor: number };
        // No delete: a budget ends with an amount of 0 (history stays).
        Update: { amount_minor?: number };
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_minor: number;
          target_date: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { name: string; target_minor: number; target_date: string };
        Update: { name?: string; target_minor?: number; target_date?: string; archived_at?: string | null };
        Relationships: [];
      };
      goal_contributions: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string;
          occurred_on: string;
          amount_minor: number;
          note: string;
          // Set by the daily job for a recurring contribution (D-40).
          recurring_rule_id: string | null;
          occurrence_date: string | null;
          created_at: string;
        };
        Insert: {
          goal_id: string;
          occurred_on: string;
          amount_minor: number;
          note?: string;
          // The daily job only (service_role): it has no signed-in user.
          user_id?: string;
          recurring_rule_id?: string;
          occurrence_date?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      settings: {
        Row: { user_id: string; weekly_email: boolean; updated_at: string };
        Insert: { weekly_email: boolean };
        Update: { weekly_email?: boolean };
        Relationships: [];
      };
      report_emails: {
        Row: {
          user_id: string;
          week_start: string;
          status: "sent" | "failed";
          sent_at: string | null;
          error: string;
          updated_at: string;
        };
        // Written by the daily job only (service_role).
        Insert: { user_id: string; week_start: string; status: "sent" | "failed"; sent_at: string | null; error?: string };
        Update: { status?: "sent" | "failed"; sent_at?: string | null; error?: string };
        Relationships: [];
      };
      fx_rates: {
        Row: {
          rate_date: string;
          base: "GHS" | "USD";
          quote: "GHS" | "USD";
          // numeric arrives as a JSON number.
          rate: number;
          source: string;
          fetched_at: string;
        };
        // Written only by the daily job with the secret key (never the app).
        Insert: {
          rate_date: string;
          base: "GHS" | "USD";
          quote: "GHS" | "USD";
          rate: number | string;
          source: string;
          fetched_at?: string;
        };
        Update: { rate?: number | string; source?: string; fetched_at?: string };
        Relationships: [];
      };
    };
    Views: {
      account_balances: {
        Row: { account_id: string; balance_minor: number; has_transactions: boolean };
        Relationships: [];
      };
    };
    Functions: {
      seed_starter_categories: { Args: Record<string, never>; Returns: undefined };
      // Saves a transfer and its optional fee together (build step 6).
      save_transfer: {
        Args: {
          p_id: string | null;
          p_occurred_on: string;
          p_from_account_id: string;
          p_to_account_id: string;
          p_amount_minor: number;
          p_to_amount_minor: number;
          p_currency: "GHS" | "USD";
          p_fx_rate: number | string;
          p_fx_source: "none" | "auto" | "manual";
          p_fx_rate_date: string | null;
          p_amount_ghs_minor: number;
          p_fee_minor: number | null;
          p_fee_ghs_minor: number | null;
          p_note: string;
        };
        Returns: string;
      };
      // Deletes a transfer with its fee; returns save_transfer's arguments
      // for Undo, or null when it is not the user's transfer.
      delete_transfer: { Args: { p_id: string }; Returns: unknown };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
