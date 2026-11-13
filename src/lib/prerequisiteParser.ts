import { PrerequisiteExpression } from "../types";
import { findCourseIdsInText } from "./courseCodes";


export interface SplitRequirementsText {
  prerequisiteText: string;
  corequisiteText: string;
}


export interface NormalizedRequirements {
  prerequisiteExpression: PrerequisiteExpression | null;
  corequisiteExpression: PrerequisiteExpression | null;
  prerequisiteIds: Set<string>;
  corequisiteIds: Set<string>;
}


/**
 * Split SFU Outlines prerequisite block into prerequisite/corequisite text.
 */
export function splitSfuRequirementsSection(
  combinedText: string
): SplitRequirementsText {

  let body = combinedText.trim();

  if (!body)
    return {
      prerequisiteText:"",
      corequisiteText:""
    };


  body = body.replace(
    /^Prerequisites:\s*/i,
    ""
  );


  const match =
    body.match(
      /([\s\S]*?)(?:Corequisites?:\s*)([\s\S]*)/i
    );


  if(match){

    return {
      prerequisiteText:
        normalizeRequirementSection(match[1]),

      corequisiteText:
        normalizeRequirementSection(match[2])
    };

  }


  return {
    prerequisiteText:
      normalizeRequirementSection(body),

    corequisiteText:""
  };

}



/**
 * Normalize SFU formatting.
 */
export function normalizeRequirementSection(
  text:string
):string {


  return text
    .split("\n")
    .map(line =>
      line
        .replace(/^\s*[-•*]\s*/,"")
        .trim()
    )
    .filter(Boolean)
    .join("; ")

    .replace(/\s+/g," ")
    .replace(/\(\s+/g,"(")
    .replace(/\s+\)/g,")")
    .replace(/\.$/,"")
    .trim();

}



/**
 * Extract calendar prerequisite/corequisite fields.
 */
export function extractCalendarRequirements(
 description:string
):SplitRequirementsText{


 const prerequisiteText =
   extractLabeledSection(
     description,
     "Prerequisite"
   ) ?? "";


 const corequisiteText =
   extractLabeledSection(
     description,
     "Corequisite"
   ) ?? "";


 return {
   prerequisiteText,
   corequisiteText
 };

}



function extractLabeledSection(
 description:string,
 label:"Prerequisite"|"Corequisite"
):string|null{


 const regex =
 label==="Prerequisite"

 ?
 /Prerequisites?:\s*([\s\S]*?)(?=\.\s*(?:Corequisites?|Recommended|Students with credit|Quantitative|Breadth)|$)/i

 :
 /Corequisites?:\s*([\s\S]*?)(?=\.\s*(?:Recommended|Students with credit|Quantitative|Breadth)|$)/i;


 const match =
   description.match(regex);


 if(!match)
   return null;


 return normalizeRequirementSection(
   match[1]
 );

}



/**
 * Extract "may be taken concurrently" courses.
 */
export function extractConcurrentCorequisites(
 text:string
):SplitRequirementsText{


 const corequisites:string[]=[];


 let prerequisiteText =
 text.replace(
 /([A-Z]{2,6}\s?\d{3}[A-Z]?)\s+may be taken concurrently/gi,
 (_match,course)=>{
    corequisites.push(course);
    return "";
 }
 );


 prerequisiteText =
 prerequisiteText
 .replace(/,\s*,/g,",")
 .replace(/\s+/g," ")
 .trim();



 return {

   prerequisiteText,

   corequisiteText:
     corequisites.join("; ")

 };

}



/**
 * Resolve prerequisite text source.
 */
export function resolveRequirementTexts(
 rawSource:string
):SplitRequirementsText{


 const source =
   rawSource.trim();


 if(!source)
   return {
     prerequisiteText:"",
     corequisiteText:""
   };



 let result:SplitRequirementsText;


 if(
   /^Prerequisites:/i.test(source)
   ||
   /Corequisites?:/i.test(source)
 ){

   result =
     splitSfuRequirementsSection(
       source
     );

 }

 else if(
   /Prerequisites?:/i.test(source)
 ){

   result =
     extractCalendarRequirements(
       source
     );

 }

 else {

   result={
     prerequisiteText:
       normalizeRequirementSection(source),

     corequisiteText:""
   };

 }



 const concurrent =
   extractConcurrentCorequisites(
     result.prerequisiteText
   );


 return {

   prerequisiteText:
     concurrent.prerequisiteText,


   corequisiteText:
     [
       result.corequisiteText,
       concurrent.corequisiteText
     ]
     .filter(Boolean)
     .join("; ")

 };

}



/**
 * Remove irrelevant SFU wording.
 */
function cleanClause(
 text:string
):string{


 return text

 .replace(
 /\s+with\s+(?:a\s+)?minimum\s+grade\s+of\s+[A-F][+-]?/gi,
 ""
 )

 .replace(
 /\s+with\s+(?:a\s+)?grade\s+of\s+[A-F][+-]?/gi,
 ""
 )

 .replace(
 /\s*\([^)]*equivalent[^)]*\)/gi,
 ""

 )

 .trim();

}



/**
 * Split text while respecting parentheses.
 */
function splitOutsideParentheses(
 text:string,
 separator:RegExp
):string[]{


 const parts:string[]=[];

 let current="";

 let depth=0;


 for(let i=0;i<text.length;i++){

   const char=text[i];


   if(char==="(")
     depth++;


   if(char===")")
     depth--;



   if(
     depth===0 &&
     separator.test(
       text.slice(i)
     )
   ){

     parts.push(
       current.trim()
     );

     current="";

     continue;
   }


   current+=char;

 }


 if(current.trim())
   parts.push(
     current.trim()
   );


 return parts;

}



/**
 * Parse individual prerequisite clause.
 */
function parseClause(
 clause:string,
 codeToId:Map<string,string>
):PrerequisiteExpression|null{


 clause =
   cleanClause(clause);



 const oneOf =
 clause.match(
 /(?:one of|any of|either)\s+(.+)/i
 );


 if(oneOf){

   const ids =
     findCourseIdsInText(
       oneOf[1],
       codeToId
     );


   if(ids.length){

     return {

       type:"or",

       items:
         ids.map(courseId=>({

           type:"course",

           courseId

         }))

     };

   }

 }



 const ids =
   findCourseIdsInText(
     clause,
     codeToId
   );


 if(!ids.length)
   return null;



 if(ids.length===1){

   return {

     type:"course",

     courseId:ids[0]

   };

 }



 return {

   type:"and",

   items:
     ids.map(courseId=>({

       type:"course",

       courseId

     }))

 };

}



/**
 * Parse SFU prerequisite expression.
 */
export function parsePrerequisiteExpression(
 text:string,
 codeToId:Map<string,string>
):PrerequisiteExpression|null{


 const cleaned =
   normalizeRequirementSection(
     text
   );


 if(!cleaned)
   return null;



 const andParts =
   splitOutsideParentheses(
     cleaned,
     /\s+and\s+/i
   );



 const expressions =
   andParts
   .map(part=>{


     const orParts =
       splitOutsideParentheses(
         part,
         /\s+or\s+/i
       );



     if(orParts.length>1){

       const items =
         orParts
         .map(p =>
           parseClause(
             p,
             codeToId
           )
         )
         .filter(
           (x):x is PrerequisiteExpression =>
             x!==null
         );


       if(items.length){

         return {

           type:"or",

           items

         };

       }

     }



     return parseClause(
       part,
       codeToId
     );


   })
   .filter(
     (x):x is PrerequisiteExpression =>
       x!==null
   );



 if(!expressions.length)
   return null;



 if(expressions.length===1)
   return expressions[0];



 return {

   type:"and",

   items:expressions

 };

}



/**
 * Collect course IDs from expression.
 */
export function collectCourseIds(
 expression:PrerequisiteExpression|null
):Set<string>{


 const ids =
   new Set<string>();


 if(!expression)
   return ids;



 function walk(
  node:PrerequisiteExpression
 ){

   if(node.type==="course"){

     ids.add(
       node.courseId
     );

     return;

   }


   node.items.forEach(walk);

 }


 walk(expression);


 return ids;

}



/**
 * Full normalization pipeline.
 */
export function normalizeRequirementsFromText(
 rawSource:string,
 codeToId:Map<string,string>
):NormalizedRequirements{


 const {
   prerequisiteText,
   corequisiteText

 } =
 resolveRequirementTexts(
   rawSource
 );



 const prerequisiteExpression =
   parsePrerequisiteExpression(
     prerequisiteText,
     codeToId
   );


 const corequisiteExpression =
   parsePrerequisiteExpression(
     corequisiteText,
     codeToId
   );



 return {

   prerequisiteExpression,

   corequisiteExpression,


   prerequisiteIds:
     collectCourseIds(
       prerequisiteExpression
     ),


   corequisiteIds:
     collectCourseIds(
       corequisiteExpression
     )

 };

}



/**
 * Backwards compatibility.
 */
export function extractRequirementSection(
 description:string,
 kind:"prerequisite"|"corequisite"
):string|null{


 const result =
   resolveRequirementTexts(
     description
   );


 const text =
   kind==="prerequisite"
   ? result.prerequisiteText
   : result.corequisiteText;


 return text || null;

}