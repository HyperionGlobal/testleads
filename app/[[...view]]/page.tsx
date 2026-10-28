import {redirect} from 'next/navigation';
import { getUser } from '@/lib/auth';
import Workspace from '@/app/workspace';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getUser();if(!user)redirect('/login');return <Workspace user={user}/>}
