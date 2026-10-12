import {NextResponse} from 'next/server';
import {isAdminRequest} from '@/lib/admin-auth';
import {buildConsultativeApproach} from '@/lib/agents/consultative-approach';
import {z} from 'zod';
const schema=z.object({
 businessName:z.string().min(1).max(200), niche:z.string().min(1).max(200),
 region:z.string().min(1).max(200),reviewCount:z.number().int().nonnegative().nullish(),
 competitorAverageReviews:z.number().nonnegative().nullish(),rating:z.number().min(0).max(5).nullish(),
 sourceUrl:z.string().url().nullish(),sourceObservedAt:z.string().nullish()
});
/** Draft only. No GHL action, sequence scheduling, or sending. */
export async function POST(req:Request) {
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
 const raw=await req.json().catch(()=>null);
 const parsed=schema.safeParse(raw);
 if(!parsed.success)return NextResponse.json({error:'Dados inválidos.'},{status:400});
 const draft=buildConsultativeApproach(parsed.data);
 return NextResponse.json({draft,dispatch:false,humanApprovalRequired:true},{headers:{'Cache-Control':'no-store'}});
}
