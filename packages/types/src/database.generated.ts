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
      attendance_records: {
        Row: {
          checked_in_at: string | null
          checked_out_at: string | null
          child_id: string
          classroom_id: string
          created_at: string
          enrollment_id: string
          id: string
          note: string | null
          recorded_by_membership_id: string
          recorded_by_user_id: string
          school_id: string
          service_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          child_id: string
          classroom_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          note?: string | null
          recorded_by_membership_id: string
          recorded_by_user_id: string
          school_id: string
          service_date: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          child_id?: string
          classroom_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          note?: string | null
          recorded_by_membership_id?: string
          recorded_by_user_id?: string
          school_id?: string
          service_date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_child_id_school_id_fkey"
            columns: ["child_id", "school_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_records_classroom_id_school_id_fkey"
            columns: ["classroom_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_records_enrollment_id_school_id_fkey"
            columns: ["enrollment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "child_enrollments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_records_recorded_by_membership_id_school_id_fkey"
            columns: ["recorded_by_membership_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_memberships"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          entity_id: string | null
          entity_table: string
          id: number
          new_values: Json
          occurred_at: string
          old_values: Json
          school_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          entity_id?: string | null
          entity_table: string
          id?: never
          new_values?: Json
          occurred_at?: string
          old_values?: Json
          school_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          entity_id?: string | null
          entity_table?: string
          id?: never
          new_values?: Json
          occurred_at?: string
          old_values?: Json
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      care_events: {
        Row: {
          bulk_batch_id: string | null
          category: Database["public"]["Enums"]["care_category"]
          child_id: string
          classroom_id: string
          created_at: string
          ended_at: string | null
          enrollment_id: string
          id: string
          meal_outcome: Database["public"]["Enums"]["meal_outcome"] | null
          note: string | null
          outcome_code: string | null
          quantity: number | null
          recorded_at: string
          recorded_by_membership_id: string
          recorded_by_user_id: string
          school_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["care_event_status"]
          timetable_service_date: string | null
          timetable_slot_id: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          bulk_batch_id?: string | null
          category: Database["public"]["Enums"]["care_category"]
          child_id: string
          classroom_id: string
          created_at?: string
          ended_at?: string | null
          enrollment_id: string
          id?: string
          meal_outcome?: Database["public"]["Enums"]["meal_outcome"] | null
          note?: string | null
          outcome_code?: string | null
          quantity?: number | null
          recorded_at?: string
          recorded_by_membership_id: string
          recorded_by_user_id: string
          school_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["care_event_status"]
          timetable_service_date?: string | null
          timetable_slot_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          bulk_batch_id?: string | null
          category?: Database["public"]["Enums"]["care_category"]
          child_id?: string
          classroom_id?: string
          created_at?: string
          ended_at?: string | null
          enrollment_id?: string
          id?: string
          meal_outcome?: Database["public"]["Enums"]["meal_outcome"] | null
          note?: string | null
          outcome_code?: string | null
          quantity?: number | null
          recorded_at?: string
          recorded_by_membership_id?: string
          recorded_by_user_id?: string
          school_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["care_event_status"]
          timetable_service_date?: string | null
          timetable_slot_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_events_child_id_school_id_fkey"
            columns: ["child_id", "school_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "care_events_classroom_id_school_id_fkey"
            columns: ["classroom_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "care_events_enrollment_id_school_id_fkey"
            columns: ["enrollment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "child_enrollments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "care_events_recorded_by_membership_id_school_id_fkey"
            columns: ["recorded_by_membership_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_memberships"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "care_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_events_timetable_slot_id_school_id_fkey"
            columns: ["timetable_slot_id", "school_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      child_enrollments: {
        Row: {
          child_id: string
          classroom_id: string
          created_at: string
          ends_on: string | null
          id: string
          school_id: string
          starts_on: string
          status: Database["public"]["Enums"]["enrollment_status"]
          updated_at: string
        }
        Insert: {
          child_id: string
          classroom_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          school_id: string
          starts_on: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          updated_at?: string
        }
        Update: {
          child_id?: string
          classroom_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          school_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_enrollments_child_id_school_id_fkey"
            columns: ["child_id", "school_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "child_enrollments_classroom_id_school_id_fkey"
            columns: ["classroom_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "child_enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      child_guardians: {
        Row: {
          child_id: string
          created_at: string
          guardian_membership_id: string
          id: string
          is_primary: boolean
          relationship_label: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          guardian_membership_id: string
          id?: string
          is_primary?: boolean
          relationship_label: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          guardian_membership_id?: string
          id?: string
          is_primary?: boolean
          relationship_label?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_guardians_child_id_school_id_fkey"
            columns: ["child_id", "school_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "child_guardians_guardian_membership_id_school_id_fkey"
            columns: ["guardian_membership_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_memberships"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "child_guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          created_at: string
          date_of_birth: string | null
          id: string
          legal_name: string | null
          preferred_name: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          id?: string
          legal_name?: string | null
          preferred_name: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          id?: string
          legal_name?: string | null
          preferred_name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_staff_assignments: {
        Row: {
          classroom_id: string
          created_at: string
          ends_on: string | null
          id: string
          membership_id: string
          school_id: string
          starts_on: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          membership_id: string
          school_id: string
          starts_on?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          membership_id?: string
          school_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_staff_assignments_classroom_id_school_id_fkey"
            columns: ["classroom_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classroom_staff_assignments_membership_id_school_id_fkey"
            columns: ["membership_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_memberships"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classroom_staff_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          name: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          name: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classrooms_branch_id_school_id_fkey"
            columns: ["branch_id", "school_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classrooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_catalogue: {
        Row: {
          category: Database["public"]["Enums"]["feature_category"]
          created_at: string
          key: string
          label: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["feature_category"]
          created_at?: string
          key: string
          label: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["feature_category"]
          created_at?: string
          key?: string
          label?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by_user_id: string
          invited_email: string
          invited_role: Database["public"]["Enums"]["school_role"]
          revoked_at: string | null
          school_id: string
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          invited_by_user_id: string
          invited_email: string
          invited_role: Database["public"]["Enums"]["school_role"]
          revoked_at?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string
          invited_email?: string
          invited_role?: Database["public"]["Enums"]["school_role"]
          revoked_at?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          created_at: string
          feature_key: string
          is_allowed: boolean
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          is_allowed?: boolean
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          is_allowed?: boolean
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_catalogue"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
          max_active_children: number
          max_staff: number
          status: Database["public"]["Enums"]["record_status"]
          storage_allowance_bytes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
          max_active_children: number
          max_staff: number
          status?: Database["public"]["Enums"]["record_status"]
          storage_allowance_bytes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
          max_active_children?: number
          max_staff?: number
          status?: Database["public"]["Enums"]["record_status"]
          storage_allowance_bytes?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_administrators: {
        Row: {
          granted_at: string
          granted_by_user_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by_user_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by_user_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_administrators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_feature_settings: {
        Row: {
          configured_by_user_id: string | null
          created_at: string
          feature_key: string
          is_enabled: boolean
          school_id: string
          updated_at: string
        }
        Insert: {
          configured_by_user_id?: string | null
          created_at?: string
          feature_key: string
          is_enabled?: boolean
          school_id: string
          updated_at?: string
        }
        Update: {
          configured_by_user_id?: string | null
          created_at?: string
          feature_key?: string
          is_enabled?: boolean
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_feature_settings_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_catalogue"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "school_feature_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_memberships: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["school_role"]
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          role: Database["public"]["Enums"]["school_role"]
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["school_role"]
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_id: string
          slug: string
          status: Database["public"]["Enums"]["record_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_id: string
          slug: string
          status?: Database["public"]["Enums"]["record_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["record_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_exceptions: {
        Row: {
          classroom_id: string
          created_at: string
          created_by_user_id: string
          id: string
          kind: Database["public"]["Enums"]["timetable_exception_kind"]
          reason: string | null
          replacement_end_time: string | null
          replacement_start_time: string | null
          replacement_title: string | null
          school_id: string
          service_date: string
          status: Database["public"]["Enums"]["record_status"]
          timetable_slot_id: string | null
          updated_at: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          created_by_user_id: string
          id?: string
          kind: Database["public"]["Enums"]["timetable_exception_kind"]
          reason?: string | null
          replacement_end_time?: string | null
          replacement_start_time?: string | null
          replacement_title?: string | null
          school_id: string
          service_date: string
          status?: Database["public"]["Enums"]["record_status"]
          timetable_slot_id?: string | null
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["timetable_exception_kind"]
          reason?: string | null
          replacement_end_time?: string | null
          replacement_start_time?: string | null
          replacement_title?: string | null
          school_id?: string
          service_date?: string
          status?: Database["public"]["Enums"]["record_status"]
          timetable_slot_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_exceptions_classroom_id_school_id_fkey"
            columns: ["classroom_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "timetable_exceptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_exceptions_timetable_slot_id_school_id_fkey"
            columns: ["timetable_slot_id", "school_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          care_feature_key: string | null
          classroom_id: string
          created_at: string
          created_by_user_id: string
          day_of_week: number
          end_time: string
          id: string
          school_id: string
          start_time: string
          status: Database["public"]["Enums"]["record_status"]
          title: string
          updated_at: string
        }
        Insert: {
          care_feature_key?: string | null
          classroom_id: string
          created_at?: string
          created_by_user_id: string
          day_of_week: number
          end_time: string
          id?: string
          school_id: string
          start_time: string
          status?: Database["public"]["Enums"]["record_status"]
          title: string
          updated_at?: string
        }
        Update: {
          care_feature_key?: string | null
          classroom_id?: string
          created_at?: string
          created_by_user_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          school_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["record_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_care_feature_key_fkey"
            columns: ["care_feature_key"]
            isOneToOne: false
            referencedRelation: "feature_catalogue"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "timetable_slots_classroom_id_school_id_fkey"
            columns: ["classroom_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          preferred_locale: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          preferred_locale?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          preferred_locale?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
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
      attendance_status: "expected" | "present" | "absent" | "excused"
      care_category:
        | "meal"
        | "bottle"
        | "water"
        | "sleep"
        | "toilet"
        | "nappy"
        | "mood"
        | "activity"
        | "note"
      care_event_status: "recorded" | "corrected" | "voided"
      enrollment_status: "planned" | "active" | "completed" | "cancelled"
      feature_category: "core" | "care" | "communication" | "media"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      meal_outcome:
        | "ate_all"
        | "ate_most"
        | "ate_some"
        | "ate_little"
        | "none_refused"
      record_status: "active" | "inactive" | "archived"
      school_role: "school_admin" | "teacher" | "guardian"
      timetable_exception_kind:
        | "cancelled"
        | "changed"
        | "replacement"
        | "additional"
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
    Enums: {
      attendance_status: ["expected", "present", "absent", "excused"],
      care_category: [
        "meal",
        "bottle",
        "water",
        "sleep",
        "toilet",
        "nappy",
        "mood",
        "activity",
        "note",
      ],
      care_event_status: ["recorded", "corrected", "voided"],
      enrollment_status: ["planned", "active", "completed", "cancelled"],
      feature_category: ["core", "care", "communication", "media"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      meal_outcome: [
        "ate_all",
        "ate_most",
        "ate_some",
        "ate_little",
        "none_refused",
      ],
      record_status: ["active", "inactive", "archived"],
      school_role: ["school_admin", "teacher", "guardian"],
      timetable_exception_kind: [
        "cancelled",
        "changed",
        "replacement",
        "additional",
      ],
    },
  },
} as const

