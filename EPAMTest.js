/**
 * #1
 */
const checkDone = (images, tasks) => images.length === tasks.length;

function loadImages(callback) {
  const images = [];
  const asyncTasks = [
    // setTimeout means load a image from server
    () => setTimeout((response) => {
      images.push(response);
      checkDone(images, asyncTasks) && callback(images);
    }, 1000, 'image1'),
    () => setTimeout((response) => {
      images.push(response);
      checkDone(images, asyncTasks) && callback(images);
    }, 1000, 'image2'),
    () => setTimeout((response) => {
      images.push(response);
      checkDone(images, asyncTasks) && callback(images);
    }, 1000, 'image3'),
    () => setTimeout((response) => {
      images.push(response);
      checkDone(images, asyncTasks) && callback(images);
    }, 1000, 'image4'),
    () => setTimeout((response) => {
      images.push(response);
      checkDone(images, asyncTasks) && callback(images);
    }, 1000, 'image5'),
  ];
  try {
    asyncTasks.forEach(task => task());
  } catch (e) {
    // if one of the tasks fail
    throw e;
  }
}

try {
  loadImages((images) => {
    console.log(images);
  });
} catch (e) {
  // load fail
  console.log(e.message);
}
