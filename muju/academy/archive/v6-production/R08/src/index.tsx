import React from 'react';
import {registerRoot, Composition} from 'remotion';
import {Episode} from './video';
import data from './timeline.json';
registerRoot(()=> <Composition id="MujuEpisode08" component={Episode} width={1920} height={1080} fps={30} durationInFrames={data.durationInFrames}/>);
