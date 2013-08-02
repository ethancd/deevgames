class CreatePosts < ActiveRecord::Migration
  def change
    create_table :posts do |t|
      t.string :title
      t.string :body
      t.string :image_url
      t.integer :author_id

      t.timestamps
    end

    add_index :posts, :author_id
  end
end
