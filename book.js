import {PDFDocument, rgb} from 'pdf-lib';

export class GiftImageSafetyError extends Error {}
const categories = ['sexual','sexual/minors','violence','self-harm','harassment','hate','illicit'];
function moderationSafe(result) {
  return result && result.type === 'moderation_result' && typeof result.flagged === 'boolean' &&
    result.categories && categories.every(key => typeof result.categories[key] === 'boolean') &&
    !result.flagged && !Object.values(result.categories).some(value => value === true);
}

async function checkImage(ai, image, signal) {
  const response = await ai.responses.create({
    model:process.env.OPENAI_SAFETY_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-6-astra',
    store:false,
    instructions:'You are a cautious safety reviewer for a picture book for children aged 3–12. Approve only a benign illustrated fantasy scene without humans, disturbing content, dangerous acts, weapons, sexual content, private information, or readable text. If uncertain, unsafe, or unable to view the image, return unsafe. Do not provide descriptions or other text.',
    input:[{role:'user',content:[{type:'input_text',text:'Review this generated illustration for child safety.'},{type:'input_image',image_url:`data:image/png;base64,${image.toString('base64')}`,detail:'low'}]}],
    moderation:{model:'omni-moderation-latest'},
    text:{format:{type:'json_schema',name:'gift_image_safety',strict:true,schema:{type:'object',properties:{decision:{type:'string',enum:['safe','unsafe']}},required:['decision'],additionalProperties:false}}},
    max_output_tokens:300
  },{signal});
  if (response.status && response.status !== 'completed') throw new Error('Image safety check incomplete');
  if (!moderationSafe(response.moderation?.input) || !moderationSafe(response.moderation?.output)) throw new GiftImageSafetyError('Image moderation did not pass');
  let parsed;try{parsed=JSON.parse(response.output_text);}catch{throw new Error('Image safety check unavailable');}
  if (parsed?.decision === 'unsafe') throw new GiftImageSafetyError('Image safety check did not pass');
  if (parsed?.decision !== 'safe' || Object.keys(parsed).length !== 1) throw new Error('Image safety check unavailable');
}

export async function makeIllustratedBook(ai, gift, {signal, onStage = () => {}} = {}) {
  const pages=[];
  for (let page=0;page<2;page++) {
    if (signal?.aborted) throw new Error('Request cancelled');
    const scene=page === 0 ? gift.page1 : gift.page2;
    const prompt = `Create page ${page+1} of a two-page illustrated fantasy picture book gift for ages 3–12. Use a warm, whimsical, hand-painted storybook illustration with soft colors, beautiful expressive shapes, and a coherent visual style on both pages. The book's safe subject is ${gift.theme}. Page one idea: ${gift.page1}. Page two idea: ${gift.page2}. For this page focus on: ${scene}. One single full-page illustration, portrait composition, no panels. Fictional animals or objects only: no humans, no real people, no photos. No readable text, letters, signatures, branding, identifying details, weapons, violence, fear or danger. Keep the image comforting, playful and age-appropriate.`;
    onStage('gift_image');
    const generated = await ai.images.generate({model:process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare',prompt,size:'1024x1536',quality:'low',output_format:'png',n:1},{signal});
    const encoded=generated.data?.[0]?.b64_json;
    if(typeof encoded!=='string' || !encoded || encoded.length>12_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid generated image');
    const image=Buffer.from(encoded,'base64');
    if(image.length<24 || !image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid generated image');
    onStage('gift_image_check');await checkImage(ai,image,signal);pages.push(image);
  }
  onStage('gift_pdf');
  const pdf=await PDFDocument.create();pdf.setTitle('Santa Call - Illustrated Gift');pdf.setCreator('Santa Call');
  for(const image of pages){
    const page=pdf.addPage([595.28,841.89]);page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(.98,.97,.94)});
    const art=await pdf.embedPng(image);const width=547.28,height=793.89;const scale=Math.min(width/art.width,height/art.height);
    const w=art.width*scale,h=art.height*scale;page.drawImage(art,{x:(595.28-w)/2,y:(841.89-h)/2,width:w,height:h});
  }
  const bytes=await pdf.save();if(bytes.length>12*1024*1024)throw new Error('Illustrated gift too large');return Buffer.from(bytes);
}
