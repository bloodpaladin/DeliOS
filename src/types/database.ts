/**
 * RoutePilot Caribbean / DeliOS – Database types
 * Generated to match supabase/migrations/20261019220000_initial_schema.sql
 * Keep in sync when the schema changes.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VerificationStatus =
  | 'unverified'
  | 'approximate'
  | 'confirmed'
  | 'flagged'
  | 'inaccessible';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ReviewStatus = 'pending_review' | 'reviewed' | 'rejected';
export type RunStatus = 'draft' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
export type DeliveryStatus =
  | 'pending'
  | 'in_progress'
  | 'navigating'
  | 'arrived'
  | 'delivered'
  | 'failed'
  | 'skipped'
  | 'cancelled';
export type OptimizationObjective = 'time' | 'distance' | 'balanced';
export type NavigationApp = 'waze' | 'google' | 'apple';
export type EventType =
  | 'created'
  | 'status_changed'
  | 'arrived'
  | 'delivered'
  | 'failed'
  | 'skipped'
  | 'recalculated'
  | 'note_added'
  | 'navigation_started';
export type AliasSource = 'ocr' | 'manual' | 'google' | 'import' | 'driver';

export interface Database {
  public: {
    Tables: {
      business_locations: {
        Row: {
          id: string;
          canonical_business_name: string;
          original_business_name: string | null;
          original_address: string | null;
          normalized_address: string | null;
          country: string;
          region: string | null;
          town: string | null;
          locality: string | null;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          geocoding_provider: string | null;
          geocoding_confidence: number | null;
          verification_status: VerificationStatus;
          verification_notes: string | null;
          entrance_or_pin_adjustment: Json | null;
          created_at: string;
          updated_at: string;
          last_verified_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          canonical_business_name: string;
          original_business_name?: string | null;
          original_address?: string | null;
          normalized_address?: string | null;
          country?: string;
          region?: string | null;
          town?: string | null;
          locality?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          geocoding_provider?: string | null;
          geocoding_confidence?: number | null;
          verification_status?: VerificationStatus;
          verification_notes?: string | null;
          entrance_or_pin_adjustment?: Json | null;
          created_at?: string;
          updated_at?: string;
          last_verified_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['business_locations']['Insert']>;
      };
      business_aliases: {
        Row: {
          id: string;
          business_location_id: string;
          alias_name: string;
          alias_address: string | null;
          source: AliasSource;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_location_id: string;
          alias_name: string;
          alias_address?: string | null;
          source?: AliasSource;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['business_aliases']['Insert']>;
      };
      route_sheet_imports: {
        Row: {
          id: string;
          user_id: string;
          storage_path: string;
          original_filename: string | null;
          ocr_provider: string | null;
          processing_status: ProcessingStatus;
          extracted_data: Json | null;
          review_status: ReviewStatus;
          error_message: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          storage_path: string;
          original_filename?: string | null;
          ocr_provider?: string | null;
          processing_status?: ProcessingStatus;
          extracted_data?: Json | null;
          review_status?: ReviewStatus;
          error_message?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['route_sheet_imports']['Insert']>;
      };
      delivery_runs: {
        Row: {
          id: string;
          user_id: string;
          run_name: string | null;
          starting_latitude: number | null;
          starting_longitude: number | null;
          starting_address: string | null;
          final_destination: Json | null;
          vehicle_profile: Json | null;
          run_status: RunStatus;
          optimization_objective: OptimizationObjective;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          run_name?: string | null;
          starting_latitude?: number | null;
          starting_longitude?: number | null;
          starting_address?: string | null;
          final_destination?: Json | null;
          vehicle_profile?: Json | null;
          run_status?: RunStatus;
          optimization_objective?: OptimizationObjective;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['delivery_runs']['Insert']>;
      };
      delivery_stops: {
        Row: {
          id: string;
          delivery_run_id: string;
          business_location_id: string | null;
          stop_number: number | null;
          original_sheet_order: number | null;
          delivery_status: DeliveryStatus;
          priority: number;
          delivery_notes: string | null;
          failure_reason: string | null;
          original_ocr_text: string | null;
          customer_name_raw: string | null;
          address_raw: string | null;
          arrived_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          delivery_run_id: string;
          business_location_id?: string | null;
          stop_number?: number | null;
          original_sheet_order?: number | null;
          delivery_status?: DeliveryStatus;
          priority?: number;
          delivery_notes?: string | null;
          failure_reason?: string | null;
          original_ocr_text?: string | null;
          customer_name_raw?: string | null;
          address_raw?: string | null;
          arrived_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['delivery_stops']['Insert']>;
      };
      delivery_events: {
        Row: {
          id: string;
          delivery_stop_id: string;
          delivery_run_id: string;
          event_type: EventType;
          event_timestamp: string;
          metadata: Json | null;
          idempotency_key: string | null;
          actor_id: string | null;
        };
        Insert: {
          id?: string;
          delivery_stop_id: string;
          delivery_run_id: string;
          event_type: EventType;
          event_timestamp?: string;
          metadata?: Json | null;
          idempotency_key?: string | null;
          actor_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['delivery_events']['Insert']>;
      };
      route_snapshots: {
        Row: {
          id: string;
          delivery_run_id: string;
          ordered_stop_ids: Json;
          route_provider: string;
          optimization_objective: string;
          estimated_distance_meters: number | null;
          estimated_duration_seconds: number | null;
          provider_response_metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          delivery_run_id: string;
          ordered_stop_ids: Json;
          route_provider: string;
          optimization_objective?: string;
          estimated_distance_meters?: number | null;
          estimated_duration_seconds?: number | null;
          provider_response_metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['route_snapshots']['Insert']>;
      };
      user_preferences: {
        Row: {
          user_id: string;
          preferred_navigation_app: NavigationApp;
          vehicle_profile: Json | null;
          route_preferences: Json | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          preferred_navigation_app?: NavigationApp;
          vehicle_profile?: Json | null;
          route_preferences?: Json | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_preferences']['Insert']>;
      };
    };
    Functions: {
      record_delivery_event: {
        Args: {
          p_stop_id: string;
          p_run_id: string;
          p_event_type: string;
          p_metadata?: Json;
          p_idempotency_key?: string;
          p_actor_id?: string;
        };
        Returns: string;
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience aliases
export type BusinessLocation = Database['public']['Tables']['business_locations']['Row'];
export type BusinessLocationInsert = Database['public']['Tables']['business_locations']['Insert'];
export type BusinessAlias = Database['public']['Tables']['business_aliases']['Row'];
export type RouteSheetImport = Database['public']['Tables']['route_sheet_imports']['Row'];
export type DeliveryRun = Database['public']['Tables']['delivery_runs']['Row'];
export type DeliveryStop = Database['public']['Tables']['delivery_stops']['Row'];
export type DeliveryEvent = Database['public']['Tables']['delivery_events']['Row'];
export type RouteSnapshot = Database['public']['Tables']['route_snapshots']['Row'];
export type UserPreferences = Database['public']['Tables']['user_preferences']['Row'];
