import { z } from 'zod';
export const courseSchema=z.object({name:z.string().trim().min(1).max(80),professor:z.string().trim().max(80).default(''),exam:z.string().max(40).default('중간고사')});
export const questionSchema=z.object({
  topic:z.string().trim().min(1).max(80),type:z.enum(['choice','short']),prompt:z.string().trim().min(8).max(1000),
  options:z.array(z.string().trim().min(1).max(300)).min(3).max(5).optional(),correct:z.number().int().min(0).max(4).optional(),
  accepted:z.array(z.string().trim().min(1).max(100)).min(1).max(8).optional(),model:z.string().max(300).optional(),
  explanation:z.string().min(10).max(1500),materialId:z.string().uuid(),page:z.number().int().min(1)
}).superRefine((q,ctx)=>{
  if(q.type==='choice' && (!q.options || q.correct===undefined || q.correct>=q.options.length || new Set(q.options).size!==q.options.length))ctx.addIssue({code:'custom',message:'Invalid choices'});
  if(q.type==='short' && (!q.accepted?.length || !q.model))ctx.addIssue({code:'custom',message:'Short answer required'});
});
export const generationSchema=z.object({questions:z.array(questionSchema).min(5).max(12)});
export const attemptSchema=z.object({courseId:z.string().uuid(),requestId:z.string().uuid(),responses:z.array(z.object({questionId:z.string().uuid(),answer:z.union([z.number().int().min(0).max(4),z.string().max(500),z.null()])})).min(5).max(20)}).refine(x=>new Set(x.responses.map(r=>r.questionId)).size===x.responses.length);
