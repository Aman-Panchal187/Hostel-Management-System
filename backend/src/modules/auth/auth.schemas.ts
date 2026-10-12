import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
const name = z.string().trim().min(2).max(100);
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit');

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

export const registerHostelSchema = z.object({
  hostelName: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(80),
  contactPhone: z.string().trim().regex(/^[+\d][\d\s-]{6,18}$/, 'Invalid phone number'),
  contactEmail: email,
  name,
  email,
  password: passwordSchema,
});

export const registerAssistantSchema = z.object({
  hostelId: z.string().uuid(),
  name,
  email,
  password: passwordSchema,
});

export const registerStudentSchema = registerAssistantSchema.extend({
  roomNumber: z.string().trim().min(1).max(20),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterHostelInput = z.infer<typeof registerHostelSchema>;
export type RegisterAssistantInput = z.infer<typeof registerAssistantSchema>;
export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;
