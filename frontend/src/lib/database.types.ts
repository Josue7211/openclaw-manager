export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          agent_id: string | null
          created_at: string | null
          description: string | null
          event_type: string | null
          id: string
          metadata: Json | null
          mission_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          description?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          mission_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          description?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          mission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_mission_id_fkey"
            columns: ["mission_id"]
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          color: string | null
          created_at: string | null
          current_task: string | null
          display_name: string | null
          emoji: string | null
          id: string
          model: string | null
          role: string | null
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          current_task?: string | null
          display_name?: string | null
          emoji?: string | null
          id: string
          model?: string | null
          role?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          current_task?: string | null
          display_name?: string | null
          emoji?: string | null
          id?: string
          model?: string | null
          role?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cache: {
        Row: {
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      capture_inbox: {
        Row: {
          content: string
          created_at: string | null
          id: string
          routed_id: string | null
          routed_to: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          routed_id?: string | null
          routed_to?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          routed_id?: string | null
          routed_to?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      captures: {
        Row: {
          created_at: string | null
          id: string
          source: string | null
          title: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          source?: string | null
          title?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          source?: string | null
          title?: string | null
          type?: string | null
        }
        Relationships: []
      }
      changelog_entries: {
        Row: {
          created_at: string | null
          date: string
          description: string | null
          id: string
          tags: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          tags?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          tags?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_reviews: {
        Row: {
          accomplishments: string | null
          created_at: string | null
          date: string
          id: string
          notes: string | null
          priorities: string | null
          updated_at: string | null
        }
        Insert: {
          accomplishments?: string | null
          created_at?: string | null
          date: string
          id?: string
          notes?: string | null
          priorities?: string | null
          updated_at?: string | null
        }
        Update: {
          accomplishments?: string | null
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          priorities?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      decisions: {
        Row: {
          alternatives: string | null
          created_at: string | null
          decision: string
          id: string
          linked_mission_id: string | null
          outcome: string | null
          rationale: string
          tags: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          alternatives?: string | null
          created_at?: string | null
          decision: string
          id?: string
          linked_mission_id?: string | null
          outcome?: string | null
          rationale: string
          tags?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          alternatives?: string | null
          created_at?: string | null
          decision?: string
          id?: string
          linked_mission_id?: string | null
          outcome?: string | null
          rationale?: string
          tags?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_linked_mission_id_fkey"
            columns: ["linked_mission_id"]
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          created_at: string | null
          host: string
          id: string
          is_default: boolean | null
          label: string
          password: string
          port: number | null
          tls: boolean | null
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          host: string
          id?: string
          is_default?: boolean | null
          label: string
          password: string
          port?: number | null
          tls?: boolean | null
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          host?: string
          id?: string
          is_default?: boolean | null
          label?: string
          password?: string
          port?: number | null
          tls?: boolean | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      habit_entries: {
        Row: {
          created_at: string | null
          date: string
          habit_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          habit_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          date?: string
          habit_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_entries_habit_id_fkey"
            columns: ["habit_id"]
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          color: string | null
          created_at: string | null
          emoji: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      ideas: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          effort: string | null
          id: string
          impact: string | null
          mission_id: string | null
          source: string | null
          status: string | null
          title: string
          updated_at: string | null
          why: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          effort?: string | null
          id?: string
          impact?: string | null
          mission_id?: string | null
          source?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          why?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          effort?: string | null
          id?: string
          impact?: string | null
          mission_id?: string | null
          source?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ideas_mission_id_fkey"
            columns: ["mission_id"]
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_entries: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          source_url: string | null
          tags: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          source_url?: string | null
          tags?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          source_url?: string | null
          tags?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      mission_events: {
        Row: {
          content: string | null
          created_at: string | null
          elapsed_seconds: number | null
          event_type: string | null
          file_path: string | null
          id: string
          mission_id: string
          model_name: string | null
          seq: number | null
          tool_input: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          elapsed_seconds?: number | null
          event_type?: string | null
          file_path?: string | null
          id?: string
          mission_id: string
          model_name?: string | null
          seq?: number | null
          tool_input?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          elapsed_seconds?: number | null
          event_type?: string | null
          file_path?: string | null
          id?: string
          mission_id?: string
          model_name?: string | null
          seq?: number | null
          tool_input?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_events_mission_id_fkey"
            columns: ["mission_id"]
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          assignee: string | null
          complexity: number | null
          created_at: string | null
          id: string
          log_path: string | null
          progress: number | null
          retry_count: number | null
          review_notes: string | null
          review_status: string | null
          routed_agent: string | null
          spawn_command: string | null
          status: string | null
          task_type: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee?: string | null
          complexity?: number | null
          created_at?: string | null
          id?: string
          log_path?: string | null
          progress?: number | null
          retry_count?: number | null
          review_notes?: string | null
          review_status?: string | null
          routed_agent?: string | null
          spawn_command?: string | null
          status?: string | null
          task_type?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee?: string | null
          complexity?: number | null
          created_at?: string | null
          id?: string
          log_path?: string | null
          progress?: number | null
          retry_count?: number | null
          review_notes?: string | null
          review_status?: string | null
          routed_agent?: string | null
          spawn_command?: string | null
          status?: string | null
          task_type?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pipeline_events: {
        Row: {
          agent_id: string | null
          created_at: string | null
          description: string | null
          event_type: string | null
          id: string
          idea_id: string | null
          metadata: Json | null
          mission_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          description?: string | null
          event_type?: string | null
          id?: string
          idea_id?: string | null
          metadata?: Json | null
          mission_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          description?: string | null
          event_type?: string | null
          id?: string
          idea_id?: string | null
          metadata?: Json | null
          mission_id?: string | null
        }
        Relationships: []
      }
      prefs: {
        Row: {
          created_at: string | null
          key: string
          label: string | null
          updated_at: string | null
          value: string | null
        }
        Insert: {
          created_at?: string | null
          key: string
          label?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string | null
          key?: string
          label?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      retrospectives: {
        Row: {
          created_at: string | null
          id: string
          improvements: string | null
          mission_id: string
          tags: Json | null
          updated_at: string | null
          what_went_well: string | null
          what_went_wrong: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          improvements?: string | null
          mission_id: string
          tags?: Json | null
          updated_at?: string | null
          what_went_well?: string | null
          what_went_wrong?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          improvements?: string | null
          mission_id?: string
          tags?: Json | null
          updated_at?: string | null
          what_went_well?: string | null
          what_went_wrong?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retrospectives_mission_id_fkey"
            columns: ["mission_id"]
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          created_at: string | null
          done: boolean | null
          due_date: string | null
          id: string
          snoozed_until: string | null
          text: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          done?: boolean | null
          due_date?: string | null
          id?: string
          snoozed_until?: string | null
          text?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          done?: boolean | null
          due_date?: string | null
          id?: string
          snoozed_until?: string | null
          text?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          created_at: string | null
          id: string
          incomplete_count: number | null
          priorities: string | null
          reflection: string | null
          updated_at: string | null
          week_start: string
          wins: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          incomplete_count?: number | null
          priorities?: string | null
          reflection?: string | null
          updated_at?: string | null
          week_start: string
          wins?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          incomplete_count?: number | null
          priorities?: string | null
          reflection?: string | null
          updated_at?: string | null
          week_start?: string
          wins?: string | null
        }
        Relationships: []
      }
      workflow_notes: {
        Row: {
          applied: boolean | null
          category: string
          created_at: string | null
          id: string
          note: string
          updated_at: string | null
        }
        Insert: {
          applied?: boolean | null
          category: string
          created_at?: string | null
          id?: string
          note: string
          updated_at?: string | null
        }
        Update: {
          applied?: boolean | null
          category?: string
          created_at?: string | null
          id?: string
          note?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
