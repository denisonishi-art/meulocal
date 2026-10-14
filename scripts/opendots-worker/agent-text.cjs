'use strict';
function textDelta(event){return ['TEXT_MESSAGE_CHUNK','TEXT_MESSAGE_CONTENT'].includes(event.type)&&typeof event.delta==='string'?event.delta:''}
module.exports={textDelta};
