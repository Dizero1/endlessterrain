# endlessterrain
A Computer Graphic project of terrain generator

# Schedule
1. Seed *   
   Basic random number generator
   ```js
   function random2(i,j,seed){return float}
   ```
2. Noise *  
   Math gen
   ```js
   //x,y or Vector2
   function noise(x,y){return height:float}
   ```
3. buffer *     
   Use noise to create terrain
   ```js
   //or chunk x,y
   function buffer(chunkid){return BufferGeometry}
   ```
4. water    
   Add water to low place
5. color shader *   
   Based on height, slope, others to color
6. tree     
   Gen tree with change of height,shape, color
7. light
   1. sunlight *
   2. shadow *
   3. fog
8. chunk render *   
   Use seed to make continous terrain, render based on camera. Calculate distance, contorl show and hide