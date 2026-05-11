export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_wallets: {
        Row: {
          admin_id: string
          balance: number
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          created_at: string
          expires_at: string
          from_user: string
          game_id: string | null
          game_mode: string
          id: string
          players_count: number
          stake: number
          status: string
          to_user: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          from_user: string
          game_id?: string | null
          game_mode?: string
          id?: string
          players_count?: number
          stake: number
          status?: string
          to_user: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          from_user?: string
          game_id?: string | null
          game_mode?: string
          id?: string
          players_count?: number
          stake?: number
          status?: string
          to_user?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          game_id: string | null
          id: string
          is_admin_broadcast: boolean | null
          recipient_id: string | null
          sender_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          game_id?: string | null
          id?: string
          is_admin_broadcast?: boolean | null
          recipient_id?: string | null
          sender_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          game_id?: string | null
          id?: string
          is_admin_broadcast?: boolean | null
          recipient_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_moves: {
        Row: {
          created_at: string
          game_id: string
          id: string
          piece: Json | null
          player_id: string
          side: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          piece?: Json | null
          player_id: string
          side?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          piece?: Json | null
          player_id?: string
          side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          board_state: Json | null
          boneyard: Json | null
          commission: number
          created_at: string
          current_turn: string | null
          expires_at: string | null
          finished_at: string | null
          game_mode: string
          id: string
          passes: number
          player1_hand: Json | null
          player1_id: string
          player2_hand: Json | null
          player2_id: string | null
          player3_hand: Json
          player3_id: string | null
          players_count: number
          reveal_until: string | null
          round_number: number
          score_p1: number
          score_p2: number
          score_p3: number
          stake: number
          status: Database["public"]["Enums"]["game_status"]
          ticket_number: string | null
          turn_started_at: string | null
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          board_state?: Json | null
          boneyard?: Json | null
          commission?: number
          created_at?: string
          current_turn?: string | null
          expires_at?: string | null
          finished_at?: string | null
          game_mode?: string
          id?: string
          passes?: number
          player1_hand?: Json | null
          player1_id: string
          player2_hand?: Json | null
          player2_id?: string | null
          player3_hand?: Json
          player3_id?: string | null
          players_count?: number
          reveal_until?: string | null
          round_number?: number
          score_p1?: number
          score_p2?: number
          score_p3?: number
          stake: number
          status?: Database["public"]["Enums"]["game_status"]
          ticket_number?: string | null
          turn_started_at?: string | null
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          board_state?: Json | null
          boneyard?: Json | null
          commission?: number
          created_at?: string
          current_turn?: string | null
          expires_at?: string | null
          finished_at?: string | null
          game_mode?: string
          id?: string
          passes?: number
          player1_hand?: Json | null
          player1_id?: string
          player2_hand?: Json | null
          player2_id?: string | null
          player3_hand?: Json
          player3_id?: string | null
          players_count?: number
          reveal_until?: string | null
          round_number?: number
          score_p1?: number
          score_p2?: number
          score_p3?: number
          stake?: number
          status?: Database["public"]["Enums"]["game_status"]
          ticket_number?: string | null
          turn_started_at?: string | null
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      lobby_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: []
      }
      ludo_games: {
        Row: {
          commission: number
          consecutive_sixes: number
          created_at: string
          current_turn_seat: number
          dice_rolled: boolean
          finished_at: string | null
          id: string
          last_dice: number | null
          pawns: Json
          player1_id: string
          player2_id: string | null
          player3_id: string | null
          player4_id: string | null
          players_count: number
          stake: number
          status: Database["public"]["Enums"]["game_status"]
          ticket_number: string | null
          turn_started_at: string | null
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          commission?: number
          consecutive_sixes?: number
          created_at?: string
          current_turn_seat?: number
          dice_rolled?: boolean
          finished_at?: string | null
          id?: string
          last_dice?: number | null
          pawns?: Json
          player1_id: string
          player2_id?: string | null
          player3_id?: string | null
          player4_id?: string | null
          players_count?: number
          stake: number
          status?: Database["public"]["Enums"]["game_status"]
          ticket_number?: string | null
          turn_started_at?: string | null
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          commission?: number
          consecutive_sixes?: number
          created_at?: string
          current_turn_seat?: number
          dice_rolled?: boolean
          finished_at?: string | null
          id?: string
          last_dice?: number | null
          pawns?: Json
          player1_id?: string
          player2_id?: string | null
          player3_id?: string | null
          player4_id?: string | null
          players_count?: number
          stake?: number
          status?: Database["public"]["Enums"]["game_status"]
          ticket_number?: string | null
          turn_started_at?: string | null
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      matchmaking_queue: {
        Row: {
          created_at: string
          game_mode: string
          id: string
          players_count: number
          stake: number
          user_id: string
        }
        Insert: {
          created_at?: string
          game_mode?: string
          id?: string
          players_count?: number
          stake: number
          user_id: string
        }
        Update: {
          created_at?: string
          game_mode?: string
          id?: string
          players_count?: number
          stake?: number
          user_id?: string
        }
        Relationships: []
      }
      password_reset_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          message: string | null
          processed_at: string | null
          selfie_url: string | null
          status: string
          temp_password: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          message?: string | null
          processed_at?: string | null
          selfie_url?: string | null
          status?: string
          temp_password?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          message?: string | null
          processed_at?: string | null
          selfie_url?: string | null
          status?: string
          temp_password?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          is_online: boolean | null
          last_seen: string | null
          mvola_name: string
          password_plain: string | null
          phone: string
          pin_plain: string | null
          selfie_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          is_online?: boolean | null
          last_seen?: string | null
          mvola_name: string
          password_plain?: string | null
          phone: string
          pin_plain?: string | null
          selfie_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          is_online?: boolean | null
          last_seen?: string | null
          mvola_name?: string
          password_plain?: string | null
          phone?: string
          pin_plain?: string | null
          selfie_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          game_id: string | null
          id: string
          mvola_phone: string | null
          mvola_reference: string | null
          processed_at: string | null
          processed_by: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          game_id?: string | null
          id?: string
          mvola_phone?: string | null
          mvola_reference?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          game_id?: string | null
          id?: string
          mvola_phone?: string | null
          mvola_reference?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          pin_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          pin_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          pin_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_challenge_start_game: {
        Args: { _challenge_id: string }
        Returns: Json
      }
      admin_approve_tx: {
        Args: { _admin_id: string; _tx_id: string }
        Returns: Json
      }
      admin_delete_chat_message: {
        Args: { _admin_id: string; _msg_id: string }
        Returns: Json
      }
      admin_delete_game: {
        Args: { _admin_id: string; _game_id: string }
        Returns: Json
      }
      admin_delete_lobby_message: {
        Args: { _admin_id: string; _msg_id: string }
        Returns: Json
      }
      admin_delete_transaction: {
        Args: { _admin_id: string; _tx_id: string }
        Returns: Json
      }
      admin_reject_tx: {
        Args: { _admin_id: string; _tx_id: string }
        Returns: Json
      }
      admin_reset_commission: {
        Args: { _admin_id: string; _pin: string }
        Returns: Json
      }
      admin_reset_user_balance: {
        Args: { _admin_id: string; _pin: string; _user_id: string }
        Returns: Json
      }
      admin_send_broadcast: {
        Args: { _admin_id: string; _content: string }
        Returns: Json
      }
      admin_total_player_balance: {
        Args: { _admin_id: string }
        Returns: number
      }
      admin_unblock_user: {
        Args: { _admin_id: string; _user_id: string }
        Returns: Json
      }
      approve_user: { Args: { _user_id: string }; Returns: Json }
      approve_user_with_message: {
        Args: { _admin_id: string; _user_id: string }
        Returns: Json
      }
      block_user: { Args: { _user_id: string }; Returns: Json }
      bot_start_stake: {
        Args: {
          _difficulty: Database["public"]["Enums"]["bot_difficulty"]
          _kind: Database["public"]["Enums"]["bot_game_kind"]
          _stake: number
        }
        Returns: Json
      }
      cancel_waiting_game: { Args: { _game_id: string }; Returns: Json }
      get_admin_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      join_3p_start: {
        Args: { _game_id: string; _player3: string }
        Returns: Json
      }
      join_and_start_game: {
        Args: { _game_id: string; _player2: string }
        Returns: Json
      }
      ludo_cancel_waiting: { Args: { _game_id: string }; Returns: Json }
      ludo_initial_pawns: { Args: { _n: number }; Returns: Json }
      ludo_join_and_start: {
        Args: { _game_id: string; _user: string }
        Returns: Json
      }
      ludo_settle: {
        Args: { _game_id: string; _winner: string }
        Returns: Json
      }
      ludo_start_deduct: { Args: { _game_id: string }; Returns: Json }
      ludo_update_state: {
        Args: {
          _consecutive_sixes?: number
          _current_turn_seat?: number
          _dice_rolled?: boolean
          _game_id: string
          _last_dice?: number
          _pawns?: Json
          _turn_started_at?: string
        }
        Returns: Json
      }
      player_update_game_state:
        | {
            Args: {
              _board_state?: Json
              _boneyard?: Json
              _current_turn?: string
              _game_id: string
              _passes?: number
              _player1_hand?: Json
              _player2_hand?: Json
              _status?: Database["public"]["Enums"]["game_status"]
              _turn_started_at?: string
            }
            Returns: Json
          }
        | {
            Args: {
              _board_state?: Json
              _boneyard?: Json
              _current_turn?: string
              _game_id: string
              _passes?: number
              _player1_hand?: Json
              _player2_hand?: Json
              _player3_hand?: Json
              _status?: Database["public"]["Enums"]["game_status"]
              _turn_started_at?: string
            }
            Returns: Json
          }
      reject_user_with_message: {
        Args: { _admin_id: string; _message: string; _user_id: string }
        Returns: Json
      }
      settle_game: {
        Args: { _game_id: string; _winner: string }
        Returns: Json
      }
      start_game_deduct: { Args: { _game_id: string }; Returns: Json }
    }
    Enums: {
      account_status: "pending" | "active" | "blocked"
      app_role: "admin" | "player"
      bot_difficulty: "easy" | "medium" | "hard"
      bot_game_kind: "billiard" | "ludo" | "poker"
      bot_game_status: "in_progress" | "won" | "lost" | "aborted"
      game_status:
        | "waiting"
        | "in_progress"
        | "finished"
        | "cancelled"
        | "blocked"
      gender: "male" | "female" | "other"
      transaction_status: "pending" | "approved" | "rejected" | "completed"
      transaction_type:
        | "deposit"
        | "withdrawal"
        | "game_win"
        | "game_loss"
        | "game_stake"
        | "refund"
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
    Enums: {
      account_status: ["pending", "active", "blocked"],
      app_role: ["admin", "player"],
      bot_difficulty: ["easy", "medium", "hard"],
      bot_game_kind: ["billiard", "ludo", "poker"],
      bot_game_status: ["in_progress", "won", "lost", "aborted"],
      game_status: [
        "waiting",
        "in_progress",
        "finished",
        "cancelled",
        "blocked",
      ],
      gender: ["male", "female", "other"],
      transaction_status: ["pending", "approved", "rejected", "completed"],
      transaction_type: [
        "deposit",
        "withdrawal",
        "game_win",
        "game_loss",
        "game_stake",
        "refund",
      ],
    },
  },
} as const
