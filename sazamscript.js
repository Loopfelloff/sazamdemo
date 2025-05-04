const file = document.querySelector('.container-input');
const audio = document.querySelector('.container-audio');
const canvas = document.querySelector('.canvas');
const context = canvas.getContext('2d');
const height = canvas.height;
const width = canvas.width;
const playButton = document.querySelector('.container-button');
// the one below variable are used for recording audio


//////////end of variable declaring thing///////////////////////////////////////////////////////////////////
file.addEventListener('change' , function(){
    const files = this.files;
    audio.src = URL.createObjectURL(files[0]);
    playButton.addEventListener('click' , function(){
        audio.play();
        analyze(audio);
    });
});
function analyze(audio){
    const audioCtx = new AudioContext();
    audioCtx.sampleRate = 600;
    const audioSource = audioCtx.createMediaElementSource(audio);
    const analyser = audioCtx.createAnalyser();
    audioSource.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;;
    const lineWidth = width/bufferLength;
    let dataArray = new Uint8Array(bufferLength);
    animate(analyser , audioSource , bufferLength , dataArray ,lineWidth);
}
function animate(analyser , audioSource , bufferLength ,dataArray , lineWidth){
    // let x=0;
    // context.clearRect(0,0,width ,height);
    // context.fillStyle = 'red';
    // analyser.getByteFrequencyData(dataArray);
    // for(let i=0; i <bufferLength-1; i++)
    // {
    //     let height = dataArray[i]/2;
    //     context.fillRect(x , canvas.height-height , lineWidth , height);
    //     x += lineWidth;
    // }
    // requestAnimationFrame(() => animate(analyser, audioSource, bufferLength, dataArray, lineWidth));
    // the one below is for the time domain graph.
    context.clearRect(0, 0, width, height);
    analyser.getByteTimeDomainData(dataArray);
    
    context.beginPath();
    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        let v = dataArray[i] / 128.0; // normalize (0 to 2)
        let y = v * height/2; // scale to canvas size

        if (i === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }

        x += sliceWidth;
    }

    context.lineWidth = 2;
    context.strokeStyle = 'red';
    context.stroke();

    requestAnimationFrame(() => animate(analyser, audioSource,bufferLength,  dataArray , lineWidth));
}
// offline analysis 
const offlinePlayButton = document.querySelector('.offline-play');
offlinePlayButton.addEventListener('click', async function() {
    // Check if a file is selected
    if (!file.files || file.files.length === 0) {
        alert('Please select an audio file first');
        return;
    }
    
    try {
        const audioFile = file.files[0];
        const frequencyData = await processAudioOffline(audioFile);
        console.log(`Processed ${frequencyData.length} frequency snapshots`);
        console.log('Sample data:', frequencyData[3200]);
        let peakArr = peakAnalysis(frequencyData);
        let hashObj =  creatingHash(peakArr);
        let songName = document.querySelector('.container-input-text').value;
        if(songName === '') {
            alert('please enter song name');
            return;
        }
        await sendForDatabase(songName , hashObj); 
    } catch (error) {
        console.error('Error processing audio:', error);
    }
});

async function processAudioOffline(audioFile) {
    const frequencyData = [];
    
    const arrayBuffer = await audioFile.arrayBuffer(); // the file is converted to array
    
    const tempCtx = new AudioContext();
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    
    // Create offline context with full duration
    const fullDuration = audioBuffer.duration;
    const offlineCtx = new OfflineAudioContext({ // apparently offline context banauda , temp audio context banayera , tyo tempcontext baanyera tyo temp context bata array of sound lai audioBuffer banayera tyo buffer ko channel no , sample rate , no of samples lai offline ctx ma copy down garnu parxa.
        numberOfChannels: audioBuffer.numberOfChannels, // this one is done 
        length: fullDuration * audioBuffer.sampleRate, // total no of sample vaneko , sampleRate * seconds = totalno of sample reocrded tei 44100 sayd ki 44000hz
        sampleRate: audioBuffer.sampleRate // yo ta obvioius vai halyo.
    });
    
    // Create source and analyzer
    const source = offlineCtx.createBufferSource();  // aba buffer banaune palo offline context ko like const audioSource = audioCtx.getElementSource() ho ki k use gare jastai
    source.buffer = audioBuffer; // offline buffer pani banunai paryo jun chai , online contextk o buffer sanga mel khanxa.
     
    const analyser = offlineCtx.createAnalyser(); // makes sense offline analyser
    // now the rest is the same source analyser ko fft count set garne , ani buffer length set garne bufferArray banaune ani source lai analyser sanga ani analyser lai offlineCtx.destination i.e speaker sanga connect garne.
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount; // This is 1024 obviously nyquist theorem anusar yehi hune vo.
    const dataArray = new Uint8Array(bufferLength);
    
    // Connect nodes
    source.connect(analyser);
    analyser.connect(offlineCtx.destination);
    
    // Calculate how many frequency bins correspond to 0-300Hz
    // Each bin represents (sampleRate / 2) / bufferLength Hz
    const hzPerBin = offlineCtx.sampleRate / 2 / bufferLength; // yo pai obvious ho frequency per bin vaneko 44000/2048 ho so 
    const numBinsFor300Hz = Math.ceil(4000 / hzPerBin); // so if 300 samma ko frequency nai measure garne ho vane ta ofcourse 300/frequencyperbin garnu paryo
     
    // frequency per bin lai math.ceil garnu ko karan extra bin liye pani kei ghata hudaina vanera ho dherai ma euta bin extra aaula.
    
    console.log(`Each frequency bin represents ${hzPerBin.toFixed(2)} Hz`); // yo the width of frequency bin ho to fixed vaneko 23.4445677 lai 23.44 banauna round off garxa
    // nai taha vayena.
    console.log(`Using ${numBinsFor300Hz} bins to cover 0-300 Hz range`);
    
    // Set up time intervals for sampling
    const interval = 0.05; // Collect data every 50ms
    const totalSamples = Math.floor(fullDuration / interval); // yo pani ofcourse makes sense .
    
    // Schedule data collection at regular intervals
    for (let i = 0; i < totalSamples; i++) {
        const time = i * interval;
        // offlineCtx.suspend(time) le time snapshot ma particular code run garxa jasle background ma gana run hunxa ani tala ko analyser.getByteFrequencyData(dataArray) le fft analysis garna 
        offlineCtx.suspend(time).then(() => {
            analyser.getByteFrequencyData(dataArray); //  THIS IS WHERE THE FFT ANALYSIS BEING DONE.
            
            // very very very very very very very very very important thing has just been mentioned here and that is that , yo code le jamma 300hz samma linxa array lai slice garera
            const lowFrequencyData = Array.from(dataArray.slice(0, numBinsFor300Hz)); 
            
            // Calculate exact frequency for each bin
            const freqBinData = lowFrequencyData.map((amplitude, binIndex) => {
                return {
                    frequency: binIndex * hzPerBin, // Actual frequency in Hz
                    amplitude: amplitude           // Amplitude value (0-255)
                };
            });
            
            // Add to our results with timestamp
            frequencyData.push({
                time: time.toFixed(2),
                freqData: freqBinData
            });
            
            // Resume processing
            offlineCtx.resume(); // yesle sayad feri yo loop garxa lai ajai analysis garna help garxa but i don't know i have to copy this part.
        });
    }
    
    
    source.start(0); // important part here.    
    // Process the entire audio
    console.log(`Processing ${fullDuration.toFixed(2)} seconds of audio...`);
    await offlineCtx.startRendering(); // another important part here.
    return frequencyData;
}

function peakAnalysis(frequencyData) {
    console.log(`Total time frames: ${frequencyData.length}`);
    let peakArr = [];
    console.log(frequencyData); 
    // Define frequency bands we want to analyze
    const frequencyBands = [
        { min: 40, max: 80 },
        { min: 80, max: 160 },
        { min: 160, max: 320 },
        { min: 320, max: 640 },
        {min:640 , max:1280},
        {min:1280 , max:2560},
        {min:2560  , max:4000}
    ];
    
    const timeNeighborhood = 3;
    const amplitudeThreshold = 50;
    
    // Process each time frame
    for (let i = timeNeighborhood; i < frequencyData.length - timeNeighborhood; i++) {
        const timeFrame = frequencyData[i];
        const peakVal = [];
        
        // Process each frequency band separately
        for (const band of frequencyBands) {
            // Find the frequency bins that fall within this band
            const binsInBand = timeFrame.freqData.filter(bin => 
                bin.frequency >= band.min && bin.frequency <= band.max
            );
            
            // Skip if no bins in this band
            if (binsInBand.length === 0) continue;
            
            // Find the maximum amplitude bin in this frequency band
            const maxBin = binsInBand.reduce((max, current) => 
                current.amplitude > max.amplitude ? current : max, 
                { amplitude: 0 }
            );
            
            // Skip if amplitude is too low
            if (maxBin.amplitude < amplitudeThreshold) continue;
            
            // Check if this is a peak in time domain (comparing with neighboring frames)
            let isPeak = true;
            
            // Get the frequency index of this bin in the original data
            const binIndex = timeFrame.freqData.findIndex(bin => 
                bin.frequency === maxBin.frequency
            );
            
            // Check neighboring time frames
            for (let t = i - timeNeighborhood; t <= i + timeNeighborhood && isPeak; t++) {
                if (t === i) continue; // Skip self comparison in time
                
                // Make sure the neighboring frame has data for this frequency
                if (frequencyData[t].freqData[binIndex] && 
                    frequencyData[t].freqData[binIndex].amplitude > maxBin.amplitude) {
                    isPeak = false;
                    break;
                }
            }
            
            // If it's a true peak, add it
            if (isPeak) {
                peakVal.push({
                    freqData: maxBin,
                    band: `${band.min}-${band.max}Hz`
                });
            }
        }
        
        // Only add time frames that have at least one peak
        if (peakVal.length > 0) {
            peakArr.push({
                time: timeFrame.time,
                peakVal: peakVal
            });
        }
    }
    
    console.log(`Found ${peakArr.length} frames with peaks`);
    return peakArr;
}

function creatingHash(peakArr){
    let hash = [];
    for(let i=0; i<peakArr.length; i++)
    {
        let time = peakArr[i].time;
        for(let j=0; j<peakArr[i].peakVal.length; j++)
        {
        if(peakArr[i].peakVal[j].freqData.frequency === 0) continue;
        let tempArr = [];
        let f1 = peakArr[i].peakVal[j].freqData.frequency;
        let lowerTimeBound, upperTimeBound, lowerFrequencyBound , upperFrequencyBound;
        lowerTimeBound = Math.min(i + 20, peakArr.length - 1);
        upperTimeBound = Math.min(i + 60, peakArr.length - 1);
        lowerFrequencyBound = (f1 - 50) < 0 ? 0 : (f1-50);
        upperFrequencyBound = (f1 + 50) > 300 ? 300 : (f1+50);
        let hashObj = hasher(peakArr , lowerTimeBound , upperTimeBound , lowerFrequencyBound , upperFrequencyBound , f1 , time);
        if(hashObj.length > 0)
        {
        let count = 0;
        while(hashObj.length !== 0 && count < 10)
        {
            let max = hashObj.reduce((acuu , curr)=>{
                return (curr.a2 > acuu.a2) ? curr : acuu;
            });
            let f2 = max.f2;
            let t2 = max.t2;
            let index = hashObj.indexOf(max);
            hashObj.splice(index, 1);   
            hash.push(
                {
                    hash : `${f1}:${f2}:${(t2-time).toFixed(2)}`,
                    offsetTime : time
                }
            );
            count++;   
        }
        };
        }
    }
    return hash;

}
function hasher(peakArr,lowerTimeBound , upperTimeBound , lowerFrequencyBound, upperFrequencyBound , f1 , t1){
    let returnObj = [];
    for(let i=lowerTimeBound; i<=upperTimeBound; i++)
        {
        let t2 = peakArr[i].time;
        for(let j=0; j<peakArr[i].peakVal.length; j++)
            {
            if(peakArr[i].peakVal[j].freqData.frequency == 0) continue;
            let f2 = peakArr[i].peakVal[j].freqData.frequency;
            if(f2 >= lowerFrequencyBound && f2<= upperFrequencyBound)
            {
            let frequency = f2;
            let amplitude = peakArr[i].peakVal[j].freqData.amplitude;
            returnObj.push({
                t2 : t2,
                f2 : f2,
                a2 : amplitude 
            });
        }
        }
    
    }
    return returnObj;
}
async function sendForDatabase(songName , hashObj)
{
    try {
        const response = await fetch('storefingerprints.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                song_name: songName,
                hashes: hashObj
            })
        });

        const result = await response.json();
        console.log(result);
    } catch (error) {
        console.error('Error sending data:', error);
    }
}
////////////////////// this one is for recording audio logic.
// Get all the DOM elements
const recordButton = document.querySelector('.recordButton');
const playButton2 = document.querySelector('.playButton');
const audioElement = audio;
const findSong = document.querySelector('.findSong');
let mediaRecorder;
let audioChunks = [];
let recordedAudioBlob = null;
// Request microphone access
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.start();
        console.log('Recording started...');

        audioChunks = [];

        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });

        // Automatically stop recordingr after 20 seconds
        setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
                console.log('Recording stopped after 20 seconds.');
            }
        }, 20000);

        mediaRecorder.addEventListener('stop', () => {
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(recordedAudioBlob); // this can also be processed by offline thing .
            audioElement.src = audioUrl;
        });

    } catch (error) {
        console.error('Error accessing microphone:', error);
    }
}

function playRecording() {
    if (recordedAudioBlob) {
        const audioUrl = URL.createObjectURL(recordedAudioBlob);
        audioElement.src = audioUrl;
        audioElement.play();
        analyze(audioElement);
    } else {
        console.log('No recording available to play.');
    }
}

// Attach event listeners
recordButton.addEventListener('click', startRecording);
playButton2.addEventListener('click', playRecording);
findSong.addEventListener('click' , async function(){
    try {
        const frequencyData = await processAudioOffline(recordedAudioBlob);
        console.log(`Processed ${frequencyData.length} frequency snapshots`);
        let peakArr = peakAnalysis(frequencyData);
        let hashObj =  creatingHash(peakArr);
        console.log(hashObj);
        // i have to send this hashObj to the backend 
        const response = await fetch('findFingerprints.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(hashObj)
        });

        const data = await response.json();
        console.log('Matching songs:', data);
        const finalMatch = findMaxRedundantNumber(data);
        console.log(finalMatch);
    } catch (error) {
        console.error('Error processing audio:', error);
    }
});
function findMaxRedundantNumber(songsArray) {
    return songsArray.map(song => {
      const counts = {};
  
      song.offset_differences.forEach(num => {
        const ceiled = Math.ceil(num);
        counts[ceiled] = (counts[ceiled] || 0) + 1;
      });
  
      // Find the number with the highest count
      let maxNumber = null;
      let maxCount = 0;
  
      for (const num in counts) {
        if (counts[num] > maxCount) {
          maxNumber = parseInt(num);
          maxCount = counts[num];
        }
      }
  
      return {
        song_name: song.song_name,
        max_redundant_number: maxNumber,
        redundancy_number: maxCount
      };
    });
  }
  