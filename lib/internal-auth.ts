import {isAdminRequest} from './admin-auth';

export async function isInternalOrAdminRequest(request:Request){
  if(await isAdminRequest(request))return true;
  const secret=process.env.INTERNAL_API_SECRET;
  return Boolean(secret&&request.headers.get('authorization')===`Bearer ${secret}`);
}
