// The shape of the database for TypeScript, in the same format the Supabase
// CLI generates (`supabase gen types typescript`). Written by hand for now;
// keep it in step with supabase/migrations. Postgres `bigint` arrives as a
// JSON number: safe here, because amounts stay below 2^53 (MAX_AMOUNT_MINOR).

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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
