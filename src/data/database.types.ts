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
      media_assets: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          created_by: string
          height_px: number
          id: string
          kind: string
          mime_type: string
          object_path: string
          original_name: string
          room_id: string
          status: string
          updated_at: string
          width_px: number
        }
        Insert: {
          bucket_id: string
          byte_size: number
          created_at?: string
          created_by: string
          height_px: number
          id?: string
          kind: string
          mime_type: string
          object_path: string
          original_name: string
          room_id: string
          status?: string
          updated_at?: string
          width_px: number
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          created_by?: string
          height_px?: number
          id?: string
          kind?: string
          mime_type?: string
          object_path?: string
          original_name?: string
          room_id?: string
          status?: string
          updated_at?: string
          width_px?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_uses: number
          revoked_at: string | null
          role: string
          room_id: string
          token_hash: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: string
          room_id: string
          token_hash: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: string
          room_id?: string
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_invites_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          joined_at: string
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role: string
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_state: {
        Row: {
          active_scene_id: string | null
          revision: number
          room_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          active_scene_id?: string | null
          revision?: number
          room_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          active_scene_id?: string | null
          revision?: number
          room_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_state_active_scene_fk"
            columns: ["active_scene_id", "room_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id", "room_id"]
          },
          {
            foreignKeyName: "room_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          realtime_topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          realtime_topic?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          realtime_topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      scenes: {
        Row: {
          background_asset_id: string | null
          created_at: string
          created_by: string
          grid_cell_size: number
          grid_enabled: boolean
          grid_offset_x: number
          grid_offset_y: number
          grid_opacity: number
          id: string
          name: string
          revision: number
          room_id: string
          snap_enabled: boolean
          updated_at: string
          world_height: number
          world_width: number
        }
        Insert: {
          background_asset_id?: string | null
          created_at?: string
          created_by: string
          grid_cell_size?: number
          grid_enabled?: boolean
          grid_offset_x?: number
          grid_offset_y?: number
          grid_opacity?: number
          id?: string
          name: string
          revision?: number
          room_id: string
          snap_enabled?: boolean
          updated_at?: string
          world_height: number
          world_width: number
        }
        Update: {
          background_asset_id?: string | null
          created_at?: string
          created_by?: string
          grid_cell_size?: number
          grid_enabled?: boolean
          grid_offset_x?: number
          grid_offset_y?: number
          grid_opacity?: number
          id?: string
          name?: string
          revision?: number
          room_id?: string
          snap_enabled?: boolean
          updated_at?: string
          world_height?: number
          world_width?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenes_background_asset_fk"
            columns: ["background_asset_id", "room_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id", "room_id"]
          },
          {
            foreignKeyName: "scenes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      token_control_grants: {
        Row: {
          created_at: string
          granted_by: string
          room_id: string
          scene_id: string
          token_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          room_id: string
          scene_id: string
          token_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          room_id?: string
          scene_id?: string
          token_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_control_grants_token_fk"
            columns: ["token_id", "room_id", "scene_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id", "room_id", "scene_id"]
          },
        ]
      }
      token_leases: {
        Row: {
          created_at: string
          expires_at: string
          lease_id: string
          token_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          lease_id: string
          token_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          lease_id?: string
          token_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_leases_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: true
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      token_transforms: {
        Row: {
          revision: number
          room_id: string
          scene_id: string
          token_id: string
          updated_at: string
          updated_by: string
          x_world: number
          y_world: number
        }
        Insert: {
          revision?: number
          room_id: string
          scene_id: string
          token_id: string
          updated_at?: string
          updated_by: string
          x_world: number
          y_world: number
        }
        Update: {
          revision?: number
          room_id?: string
          scene_id?: string
          token_id?: string
          updated_at?: string
          updated_by?: string
          x_world?: number
          y_world?: number
        }
        Relationships: [
          {
            foreignKeyName: "token_transforms_token_fk"
            columns: ["token_id", "room_id", "scene_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id", "room_id", "scene_id"]
          },
        ]
      }
      tokens: {
        Row: {
          color: string
          created_at: string
          created_by: string
          height_world: number
          id: string
          image_asset_id: string | null
          locked: boolean
          name: string
          revision: number
          room_id: string
          scene_id: string
          updated_at: string
          visibility: string
          width_world: number
          z_index: number
        }
        Insert: {
          color?: string
          created_at?: string
          created_by: string
          height_world: number
          id?: string
          image_asset_id?: string | null
          locked?: boolean
          name: string
          revision?: number
          room_id: string
          scene_id: string
          updated_at?: string
          visibility?: string
          width_world: number
          z_index?: number
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          height_world?: number
          id?: string
          image_asset_id?: string | null
          locked?: boolean
          name?: string
          revision?: number
          room_id?: string
          scene_id?: string
          updated_at?: string
          visibility?: string
          width_world?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "tokens_image_asset_fk"
            columns: ["image_asset_id", "room_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id", "room_id"]
          },
          {
            foreignKeyName: "tokens_scene_fk"
            columns: ["scene_id", "room_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id", "room_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      inspect_token_lease: {
        Args: { p_token_id: string }
        Returns: { expires_at: string; lease_id: string; user_id: string }[]
      }
      accept_room_invite: { Args: { p_token_hash: string }; Returns: string }
      acquire_token_lease: {
        Args: { p_token_id: string }
        Returns: {
          expires_at: string
          lease_id: string
        }[]
      }
      commit_token_move: {
        Args: {
          p_expected_revision: number
          p_lease_id: string
          p_token_id: string
          p_x: number
          p_y: number
        }
        Returns: {
          revision: number
          room_id: string
          scene_id: string
          token_id: string
          updated_at: string
          updated_by: string
          x_world: number
          y_world: number
        }
        SetofOptions: {
          from: "*"
          to: "token_transforms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_room: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          id: string
          name: string
          owner_id: string
          realtime_topic: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_token: {
        Args: {
          p_color: string
          p_height: number
          p_image_asset_id?: string
          p_name: string
          p_room_id: string
          p_scene_id: string
          p_width: number
          p_x: number
          p_y: number
        }
        Returns: {
          color: string
          created_at: string
          created_by: string
          height_world: number
          id: string
          image_asset_id: string | null
          locked: boolean
          name: string
          revision: number
          room_id: string
          scene_id: string
          updated_at: string
          visibility: string
          width_world: number
          z_index: number
        }
        SetofOptions: {
          from: "*"
          to: "tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_token_lease: {
        Args: { p_lease_id: string; p_token_id: string }
        Returns: boolean
      }
      renew_token_lease: {
        Args: { p_lease_id: string; p_token_id: string }
        Returns: string
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
