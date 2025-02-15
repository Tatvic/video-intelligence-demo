// Copyright 2017 Google Inc.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import _ from 'lodash';
import store from 'store';
import $ from 'jquery';
import {get} from 'idb-keyval';

import VideoCard from '../components/video-card';

class VideoPage {
  constructor(stage, router, videoId) {
    // REGISTER VARIABLES
    this.$stage = stage;
    this.router = router;
    this.videoId = videoId;
    this.videoLength = '';
    this.videoDuration = null;
    this.videos = get('videos').then((data) => {
      this.videos = data;
      this.video = _.find(this.videos, {url_safe_id: videoId});
      this.title = this.video.name;
      this.sortedLabels = this.getSortedLabels(this.video.annotations.shot_label_annotations);
      // RENDER PAGE
      this.render();
      return this;
    });
    

  }

  render() {
    // INJECT TEMPLATE INTO STAGE
    this.$stage.html(this.template());

    // REGISTER TEMPLATE ELEMENTS
    this.$hero = $('#hero');
    this.$video = $(`#${this.video.url_safe_id}`);
    this.$videoLength =  $('#video-length');
    this.$topLabels = $('#top-labels');
    this.$dataRows = $('#data-rows');
    this.$relatedVideos = $('#related-videos');
    this.$viewjson = $('#viewjson');


    // RENDER DATA ON PAGE
    this.renderVideoLength();
    // this.renderTopLabels();
    this.renderVideoCards();

    // ACTIVATE SCROLL SPY
    this.activateScrollSpy();

    this.activateLinks();

    // UPDATE PAGE LINKS
    this.router.updatePageLinks();
  }

  activateLinks() {
    this.$viewjson.on('click', () => {
      console.log(this.video);
      let videoJson = JSON.stringify(this.video.annotations, null, 2);
      let x = window.open();
      x.document.open();
      x.document.write('<html><body><pre>' + videoJson + '</pre></body></html>');
      x.document.close();
    });
  }

  toHHMMSS() {
    var sec_num = parseInt(this, 10);
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = '0'+hours;}
    if (minutes < 10) {minutes = '0'+minutes;}
    if (seconds < 10) {seconds = '0'+seconds;}
    return hours+':'+minutes+':'+seconds;
  }

  renderVideoLength() {
    // WAIT FOR METADATA TO LOAD
    this.$video.on('loadedmetadata', () => {
      const mins = parseInt(this.$video[0].duration / 60, 10);
      let seconds = parseInt(this.$video[0].duration % 60, 10);

      // FORMAT DATA AND RENDER
      if (seconds < 10) {
        seconds = '0' + seconds;
      }

      // FORMAT DATA AND RENDER
      this.videoDuration = this.$video[0].duration;
      this.videoLength = `${mins}:${seconds}`;
      this.$videoLength.append(this.videoLength);

      // REMOVE EVENT LISTENERS (CLEANUP)
      this.$video.off();
      this.renderGraph();
    });
  }

  getSortedLabels(labels) {

    const averageConfidenceList = labels.map(label => {
      let confidence = 0;
      let confidenceAverge;

      // CHECK FOR LOCATIONS
      if(label.segments && label.segments.length) {
        let confidence = 0;
        // LOOP THROUGH LOCATIONS
        _.forEach(label.segments, (segment) => {
          confidence = confidence + segment.confidence;
        });

        // FIND AVERAGE COFIDENCE FOR LABEL
        confidenceAverge = confidence / label.segments.length;

        // RETURN LABEL
        return {
          label: label.entity.description,
          confidence: confidenceAverge,
          locations: label.segments
        };
      }
    });

    return _.orderBy(averageConfidenceList, ['confidence'], ['desc']);
  }

  renderTopLabels() {
    console.log(this.video.annotations);
    const sortedList = this.getSortedLabels(this.video.annotations.shot_label_annotations);

    for (var i = 0; i < sortedList.length; i++) {
      let label = sortedList[i];

      if(i < 8) {
        let percent = (label.confidence * 100).toFixed();
        this.$topLabels.append(`<li><span class="label is-primary is-block" style="opacity: ${label.confidence};">${label.label} <em>${percent}%</em></span></li>`);
      }
    }
  }

  renderGraph() {
    const sortedLabels = this.getSortedLabels(this.video.annotations.shot_label_annotations);


    for (var i = 0; i < sortedLabels.length; i++) {
      let label = sortedLabels[i];
      let timeline = this.renderTimeline(label.locations, label.label);
      let formattedConfidence = Math.round(label.confidence * 100);

      this.$dataRows.append(`
        <tr>
          <td>
            <span class="label is-primary is-block" style="opacity: ${label.confidence};" data-balloon="Confidence: ${formattedConfidence}%" data-balloon-pos="up">
                ${label.label}
            </span>
          </td>
          <td class="is-full-width">${timeline}</td>
        </tr>
      `);
    }

    this.activateSegmentLinks();
  }

  activateSegmentLinks() {
    $('.graph-segment').on('click', (e) => {
      e.preventDefault();
      const startTime = $(e.currentTarget).data('time');

      this.$video[0].currentTime = startTime;
      this.$video[0].play();
    });
  }

  renderTimeline(locations, label) {
    let segments = [];

    for (var i = 0; i < locations.length; i++) {

      let type = locations[i].level;
      let segment = locations[i].segment;

      segments.push(this.createSegment(segment, label));

    }

    return `<div class="graph">${segments.join('')}</div>`;
  }

  createSegment(segment) {
    let segmentEl = '';
    const start = segment.start_time_offset ? (segment.start_time_offset.seconds +  segment.start_time_offset.nanos / 1000000000) : 0;
    const end = segment.end_time_offset.seconds + segment.end_time_offset.nanos / 1000000000;

    const left = (start / this.videoDuration) * 100;
    const right = 100 - ((end / this.videoDuration) * 100);

    segmentEl = `<a href="#" class="graph-segment" style="left: ${left.toFixed(2)}%; right: ${right.toFixed(2)}%;" data-time="${start}"></a>`;

    return segmentEl;
  }

  renderVideoCards() {
    // GET TOP 5 LABELS
    let top5Labels = [];
    let relatedVideos = [];

    for (let i = 0; i < 5; i++) {
      if(this.sortedLabels[i]) {
        top5Labels.push(this.sortedLabels[i].label);
      }
    }

    // FIND VIDEOS WITH THOSE LABELS
    _.each(this.videos, (video) => {
      const labels = video.annotations.shot_label_annotations;

      if(_.find(labels, ['entity.description', ...top5Labels])) {
        relatedVideos.push(video);
      }
    });

    // REMOVE CURRENT VIDEO
    const finalList = _.filter(relatedVideos, (video) => {
      return video.url_safe_id !== this.video.url_safe_id;
    });

    // RENDER ONLY 5 MAX
    for (let i = 0; i < 3; i++) {
      if(finalList[i]) {
        this.$relatedVideos.append(`
          <div class="l-space-bottom-3">${VideoCard(finalList[i])}</div>
        `);
      }
    }
  }

  activateScrollSpy() {
    const that = this;
    const $window = $(window);

    $window.on('scroll', function() {
      const location = $window.scrollTop();

      if (location > 392) {
        that.$hero.addClass('is-pinned');
      }
      else {
        that.$hero.removeClass('is-pinned');
      }
    });
  }


  template() {
    return `
      <header id="hero" class="hero">
        <div class="l-flex">
          <div class="hero-video col-1 no-margin">
            <video poster="${this.video.preview}" class="video-card-video" controls="true" id="${this.video.url_safe_id}" src="${this.video.link}"></video>
          </div>
        </div>

        <div class="announcement-bar sheet clearfix">
          <div class="announcement-bar-title l-left">
            <h3 class="text-title no-margin">${this.title}</h3>
            <p class="text-caption is-secondary no-margin" id="video-length">Length: ${this.videoLength}</p>
          </div>

          <button id="viewjson" class="button l-right">
            <i class="material-icons">code</i>
            View JSON
          </button>
        </div>
      </header>

      <article class="l-flex">
        <div id="graphs" class="col-1 l-pad-4 no-margin">
          <table class="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Timeline</th>
              </tr>
            <thead>
            <tbody id="data-rows">

            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  destroy() {
    // console.log('destroy page');
  }
}

export default VideoPage;