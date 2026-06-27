import type { ApiResponse } from '../types';

const API_BASE = '/api';

// Token getter - will be set by AuthContext
let getAuthToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  getAuthToken = getter;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    // Get auth token
    const token = getAuthToken ? await getAuthToken() : null;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'An error occurred' };
    }

    return { data };
  } catch (error) {
    console.error('API request failed:', error);
    return { error: 'Network error. Please try again.' };
  }
}

async function apiRequestWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, options);
}

// For file uploads (FormData)
async function apiUpload<T>(
  endpoint: string,
  formData: FormData
): Promise<ApiResponse<T>> {
  try {
    const token = getAuthToken ? await getAuthToken() : null;

    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || data.details || 'An error occurred' };
    }

    return { data };
  } catch (error) {
    console.error('API upload failed:', error);
    return { error: 'Network error. Please try again.' };
  }
}

// Users API
export const usersApi = {
  get: () => apiRequestWithAuth<import('../types').User>('/users'),
  create: (userData: { email: string; first_name?: string; last_name?: string }) =>
    apiRequestWithAuth<import('../types').User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),
  update: (userData: Partial<import('../types').User>) =>
    apiRequestWithAuth<import('../types').User>('/users', {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),
};

// Programs API
export const programsApi = {
  list: () => apiRequestWithAuth<import('../types').Program[]>('/programs'),
  get: (id: string) => apiRequestWithAuth<import('../types').ProgramWithBlocks>(`/programs/${id}`),
  create: (programData: { name: string; description?: string; frequency_per_week?: number }) =>
    apiRequestWithAuth<import('../types').Program>('/programs', {
      method: 'POST',
      body: JSON.stringify(programData),
    }),
  import: (formData: FormData) => apiUpload<{ message: string; program: import('../types').Program; summary: { blocks: number; workouts: number; exercises: number } }>('/excel-import', formData),
  delete: (id: string) =>
    apiRequestWithAuth<void>(`/programs/${id}`, { method: 'DELETE' }),
};

// Exercises API
export const exercisesApi = {
  list: (category?: string) =>
    apiRequestWithAuth<import('../types').Exercise[]>(
      `/exercises${category ? `?category=${encodeURIComponent(category)}` : ''}`
    ),
  get: (id: string) => apiRequestWithAuth<import('../types').Exercise>(`/exercises/${id}`),
  getSubstitutions: (id: string) =>
    apiRequestWithAuth<import('../types').Exercise[]>(`/exercises/${id}/substitutions`),
};

// User Programs API
export const userProgramsApi = {
  list: () => apiRequestWithAuth<import('../types').UserProgram[]>('/user-programs'),
  get: (id: string) => apiRequestWithAuth<import('../types').UserProgram>(`/user-programs/${id}`),
  start: (programId: string) =>
    apiRequestWithAuth<import('../types').UserProgram>('/user-programs', {
      method: 'POST',
      body: JSON.stringify({ program_id: programId }),
    }),
  update: (id: string, data: Partial<import('../types').UserProgram>) =>
    apiRequestWithAuth<import('../types').UserProgram>(`/user-programs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// User Schedules API
export const schedulesApi = {
  get: () => apiRequestWithAuth<import('../types').UserSchedule[]>('/user-schedules'),
  update: (schedules: { day_of_week: number; is_workout_day: boolean }[]) =>
    apiRequestWithAuth<import('../types').UserSchedule[]>('/user-schedules', {
      method: 'PUT',
      body: JSON.stringify({ schedules }),
    }),
};

// Workout Logs API
export const workoutLogsApi = {
  list: (params?: { limit?: number; offset?: number }) => {
    const query = params
      ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`
      : '';
    return apiRequestWithAuth<import('../types').WorkoutLogWithExercises[]>(`/workout-logs${query}`);
  },
  get: (id: string) => apiRequestWithAuth<import('../types').WorkoutLogWithExercises>(`/workout-logs/${id}`),
  create: (data: import('../types').CreateWorkoutLogInput) =>
    apiRequestWithAuth<import('../types').WorkoutLog>('/workout-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<import('../types').WorkoutLog>) =>
    apiRequestWithAuth<import('../types').WorkoutLog>(`/workout-logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequestWithAuth<void>(`/workout-logs/${id}`, { method: 'DELETE' }),
};

// Exercise Logs API
export const exerciseLogsApi = {
  create: (data: { workout_log_id: string; exercise_id: string; template_exercise_id?: string; exercise_order: number }) =>
    apiRequestWithAuth<import('../types').ExerciseLog>('/exercise-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Set Logs API
export const setLogsApi = {
  create: (data: import('../types').CreateSetLogInput) =>
    apiRequestWithAuth<import('../types').SetLog>('/set-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<import('../types').SetLog>) =>
    apiRequestWithAuth<import('../types').SetLog>(`/set-logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequestWithAuth<void>(`/set-logs/${id}`, { method: 'DELETE' }),
};

// Body Weight API
export const bodyWeightApi = {
  list: (params?: { limit?: number }) => {
    const query = params ? `?limit=${params.limit}` : '';
    return apiRequestWithAuth<import('../types').BodyWeightLog[]>(`/body-weight${query}`);
  },
  create: (data: import('../types').CreateBodyWeightLogInput) =>
    apiRequestWithAuth<import('../types').BodyWeightLog>('/body-weight', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<import('../types').BodyWeightLog>) =>
    apiRequestWithAuth<import('../types').BodyWeightLog>(`/body-weight/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequestWithAuth<void>(`/body-weight/${id}`, { method: 'DELETE' }),
};

// Progress API
export const progressApi = {
  getExerciseProgress: (exerciseId: string, params?: { days?: number }) => {
    const query = params?.days ? `?days=${params.days}` : '';
    return apiRequestWithAuth<import('../types').ExerciseProgress[]>(`/progress/exercise/${exerciseId}${query}`);
  },
};
