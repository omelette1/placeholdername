import Ajv from 'ajv';
import {requestSchema,responseSchema,assessmentSchema,validateContext,validateReferences,LIMITS} from './contract.mjs';
const ajv=new Ajv({allErrors:false,strict:true});
const requestCheck=ajv.compile(requestSchema),responseCheck=ajv.compile(responseSchema),assessmentCheck=ajv.compile(assessmentSchema);
export function checkRequest(request){if(Buffer.byteLength(JSON.stringify(request))>LIMITS.requestBytes||!requestCheck(request))throw new Error('invalid_request');validateContext(request);return request;}
export function checkAssessment(value,request){if(Buffer.byteLength(JSON.stringify(value))>LIMITS.outputBytes)throw new Error('output_size_limit');if(!assessmentCheck(value))throw new Error('schema_mismatch');validateReferences(value,request);return value;}
export function checkResponse(value,request){if(Buffer.byteLength(JSON.stringify(value))>LIMITS.outputBytes)throw new Error('output_size_limit');if(!responseCheck(value)||value.request_id!==request.request_id||value.baseline!==request.baseline)throw new Error('invalid_response');checkAssessment(value.assessment,request);return value;}
