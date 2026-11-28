import { PlatformCompanies } from '@/features/companies/platform-companies';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PlatformCompanies id={id}/>;}
