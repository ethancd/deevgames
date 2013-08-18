class AddAttachmentImageToPosts < ActiveRecord::Migration
  def up
    change_table :posts do |t|
      t.attachment :image
    end
    remove_column :posts, :image_url
  end

  def down
    drop_attached_file :posts, :image
    add_column :posts, :image_url, :string
  end
end
