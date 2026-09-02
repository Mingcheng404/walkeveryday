export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          avatar_url: string | null
          total_distance_km: number
          total_walk_time_mins: number
          current_streak: number
          created_at: string
        }
        Insert: {
          id: string
          username?: string
          avatar_url?: string | null
          total_distance_km?: number
          total_walk_time_mins?: number
          current_streak?: number
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          avatar_url?: string | null
          total_distance_km?: number
          total_walk_time_mins?: number
          current_streak?: number
          created_at?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          id: string
          user_id: string
          district: string
          estimated_time_mins: number
          path_coordinates: Json
          checkpoints: Json
          is_public: boolean
          total_distance_km: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          district: string
          estimated_time_mins: number
          path_coordinates: Json
          checkpoints?: Json
          is_public?: boolean
          total_distance_km: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          district?: string
          estimated_time_mins?: number
          path_coordinates?: Json
          checkpoints?: Json
          is_public?: boolean
          total_distance_km?: number
          created_at?: string
        }
        Relationships: []
      }
      walk_history: {
        Row: {
          id: string
          user_id: string
          route_id: string
          status: string
          covered_coordinates: Json
          calories_burned: number
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          route_id: string
          status: string
          covered_coordinates?: Json
          calories_burned?: number
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          route_id?: string
          status?: string
          covered_coordinates?: Json
          calories_burned?: number
          started_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      achievements: {
        Row: {
          id: string
          code: string
          title: string
          description: string
          icon_emoji: string
          threshold_distance_km: number
          threshold_walks: number
          threshold_streak: number
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          title: string
          description?: string
          icon_emoji?: string
          threshold_distance_km?: number
          threshold_walks?: number
          threshold_streak?: number
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          title?: string
          description?: string
          icon_emoji?: string
          threshold_distance_km?: number
          threshold_walks?: number
          threshold_streak?: number
          created_at?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          id: string
          user_id: string
          achievement_id: string
          unlocked_at: string
        }
        Insert: {
          id?: string
          user_id: string
          achievement_id: string
          unlocked_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          achievement_id?: string
          unlocked_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
