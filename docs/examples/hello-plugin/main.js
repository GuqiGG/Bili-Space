api.css('.bpx-player-video-wrap{outline:2px solid #fb7299;outline-offset:-2px}');
api.log('hello from', api.id, 'on client', api.version);

api.on('tick', () => {
  const video = api.getVideo();
  if (video) document.title = 'Hello Plugin · ' + Math.floor(video.currentTime) + 's';
});
